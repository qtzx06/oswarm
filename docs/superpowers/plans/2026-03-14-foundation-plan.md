# oswarm Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational layers (Config, Providers, Protocol, Engine core) and the Claude Code adapter, so that oswarm can spawn a real CC agent in a worktree, send it a task, and stream results to the TUI.

**Architecture:** Strict layered architecture: `Types → Config → Providers → Protocol → Engine → Adapters`. Each layer is a directory under `src/` with an `index.ts` barrel export. A structural test enforces import direction. The existing TUI and types are preserved and wired to real state.

**Tech Stack:** Bun, TypeScript, `@anthropic-ai/claude-agent-sdk`, ink/React (existing TUI)

**Spec:** `docs/superpowers/specs/2026-03-14-oswarm-architecture-design.md`
**Design addendum:** `DESIGN-ADDENDUM.md` (full autonomy, auto-spawn, multi-modal)

---

## Chunk 1: Project Structure + Types + Config + Structural Test

### Task 1: Reorganize into layered directory structure

**Files:**
- Create: `src/types/index.ts` (already exists — extend it)
- Create: `src/config/index.ts`
- Create: `src/config/schema.ts`
- Create: `src/config/defaults.ts`

- [ ] **Step 1: Create the layer directories**

```bash
mkdir -p src/{config,providers,protocol,engine,adapters}
```

- [ ] **Step 2: Extend types with full framework interfaces**

In `src/types/index.ts`, keep existing types and add the framework-level types from the spec. The existing `Task`, `AgentInfo`, `SwarmState` stay as TUI types. Add engine-level types:

```typescript
// === Existing TUI types (keep as-is) ===
export type TaskStatus = "pending" | "active" | "done" | "failed";
// ... existing types ...

// === Engine types ===
export type AdapterType = "cc" | "codex" | "openclaw" | "e2b" | "fly" | "modal";
export type ModelHint = "opus" | "sonnet" | "haiku" | "codex" | "any";
export type IsolationMode = "worktree" | "shared";
export type TaskComplexity = "trivial" | "moderate" | "complex";

export interface ExitCriteria {
  tests_pass: boolean;
  linter_clean: boolean;
  review_required: boolean;
  custom?: string;
}

export interface TaskNode {
  id: string;
  goal: string;
  isolation: IsolationMode;
  adapter: AdapterType;
  model: ModelHint;
  contextRequirements: string[];
  exitCriteria: ExitCriteria;
  estimatedComplexity: TaskComplexity;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  result?: TaskResult;
}

export interface TaskResult {
  success: boolean;
  artifacts: string[];   // file paths produced
  error?: string;
  durationMs: number;
  tokensUsed: number;
}

export interface Dependency {
  from: string;   // task id
  to: string;     // task id
  type: "blocks" | "informs";
}

export interface TaskDAG {
  nodes: TaskNode[];
  edges: Dependency[];
}

export interface AgentEvent {
  type: "progress" | "tool_use" | "reasoning" | "error" | "complete";
  agentId: string;
  taskId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface AgentHandle {
  id: string;
  adapter: AdapterType;
  pid?: number;
  worktree?: string;
  taskId: string;
}

export interface HealthStatus {
  alive: boolean;
  lastHeartbeat: number;
  memoryMb?: number;
}

export interface SpawnManifest {
  task: TaskNode;
  contextInjection: string;      // assembled prompt context
  worktreePath?: string;
  apiKeys: Record<string, string>;
  permissions: "full" | "read-only";
  tasteSpec?: TasteSpec;
}

export interface TasteSpec {
  architecture?: {
    layer?: string;
    domain?: string;
    allowed_dependencies?: string[];
  };
  patterns?: Record<string, boolean | number>;
  style?: {
    prefer?: string;
    avoid?: string;
  };
  review?: {
    ralph_loop: boolean;
    min_reviewers?: number;
    exit_criteria?: string;
  };
}
```

- [ ] **Step 3: Run type check to verify**

Run: `bun run tsc --noEmit`
Expected: 0 errors (existing TUI code should still compile)

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add engine-level interfaces (TaskDAG, AgentHandle, SpawnManifest, TasteSpec)"
```

### Task 2: Config layer

**Files:**
- Create: `src/config/schema.ts`
- Create: `src/config/defaults.ts`
- Create: `src/config/index.ts`

- [ ] **Step 1: Write config schema**

`src/config/schema.ts`:
```typescript
export interface OswarmConfig {
  schema_version: string;

  concurrency: {
    maxAgents: number;
    maxWorktrees: number;
    memoryBudgetMb: number;
  };

  adapters: {
    cc: { enabled: boolean; model: string; };
    codex: { enabled: boolean; };
    openclaw: { enabled: boolean; };
    e2b: { enabled: boolean; apiKey?: string; };
    fly: { enabled: boolean; apiKey?: string; };
    modal: { enabled: boolean; };
  };

  ralph_loop: {
    maxIterations: number;
    defaultReviewerCount: number;
  };

  paths: {
    oswarmDir: string;      // default: ".oswarm"
    worktreeDir: string;    // default: ".worktrees"
    docsDir: string;        // default: "docs"
  };

  autonomy: {
    fullAutonomy: boolean;  // per DESIGN-ADDENDUM.md
    autoSpawn: boolean;     // instant next-agent dispatch
  };
}
```

- [ ] **Step 2: Write defaults**

`src/config/defaults.ts`:
```typescript
import type { OswarmConfig } from "./schema.ts";

export const DEFAULT_CONFIG: OswarmConfig = {
  schema_version: "1.0",
  concurrency: {
    maxAgents: 8,
    maxWorktrees: 12,
    memoryBudgetMb: 4096,
  },
  adapters: {
    cc: { enabled: true, model: "sonnet" },
    codex: { enabled: false },
    openclaw: { enabled: false },
    e2b: { enabled: false },
    fly: { enabled: false },
    modal: { enabled: false },
  },
  ralph_loop: {
    maxIterations: 5,
    defaultReviewerCount: 2,
  },
  paths: {
    oswarmDir: ".oswarm",
    worktreeDir: ".worktrees",
    docsDir: "docs",
  },
  autonomy: {
    fullAutonomy: true,
    autoSpawn: true,
  },
};
```

- [ ] **Step 3: Write config loader**

`src/config/index.ts`:
```typescript
import { DEFAULT_CONFIG } from "./defaults.ts";
import type { OswarmConfig } from "./schema.ts";
export type { OswarmConfig } from "./schema.ts";

export async function loadConfig(rootDir: string): Promise<OswarmConfig> {
  const configPath = `${rootDir}/.oswarm/config.yaml`;
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    return { ...DEFAULT_CONFIG };
  }

  // Bun doesn't have built-in YAML — use JSON for now, YAML later
  const configFile = `${rootDir}/.oswarm/config.json`;
  const jsonFile = Bun.file(configFile);
  if (!(await jsonFile.exists())) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = await jsonFile.json();
  return { ...DEFAULT_CONFIG, ...raw };
}

export { DEFAULT_CONFIG };
```

- [ ] **Step 4: Run type check**

Run: `bun run tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/config/
git commit -m "config: add schema, defaults, and loader"
```

### Task 3: Structural test (layer dependency enforcement)

**Files:**
- Create: `tests/structure.test.ts`

- [ ] **Step 1: Write the structural test**

`tests/structure.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { Glob } from "bun";

// Layer order: types < config < providers < protocol < engine < adapters < skills < cli
const LAYER_ORDER = [
  "types",
  "config",
  "providers",
  "protocol",
  "engine",
  "adapters",
] as const;

function layerIndex(layer: string): number {
  return LAYER_ORDER.indexOf(layer as (typeof LAYER_ORDER)[number]);
}

function extractImports(source: string): string[] {
  const re = /from\s+["']\.\.\/(\w+)/g;
  const imports: string[] = [];
  let match;
  while ((match = re.exec(source)) !== null) {
    imports.push(match[1]!);
  }
  return imports;
}

test("layers only import from left-to-right", async () => {
  const violations: string[] = [];

  for (const layer of LAYER_ORDER) {
    const glob = new Glob(`src/${layer}/**/*.ts`);
    const myIndex = layerIndex(layer);

    for await (const filePath of glob.scan(".")) {
      const source = await Bun.file(filePath).text();
      const imports = extractImports(source);

      for (const imp of imports) {
        const impIndex = layerIndex(imp);
        if (impIndex >= 0 && impIndex >= myIndex) {
          violations.push(
            `${filePath} imports from "${imp}" (layer ${impIndex}) but is in "${layer}" (layer ${myIndex})`
          );
        }
      }
    }
  }

  expect(violations).toEqual([]);
});
```

- [ ] **Step 2: Run the test**

Run: `bun test tests/structure.test.ts`
Expected: PASS (no violations since we only have types and config, which don't import from higher layers)

- [ ] **Step 3: Commit**

```bash
git add tests/structure.test.ts
git commit -m "test: structural test enforcing layer import direction"
```

---

## Chunk 2: Providers + Protocol (Message Bus)

### Task 4: Providers layer

**Files:**
- Create: `src/providers/logger.ts`
- Create: `src/providers/keys.ts`
- Create: `src/providers/index.ts`

- [ ] **Step 1: Write structured logger**

`src/providers/logger.ts`:
```typescript
export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  ts: number;
  [key: string]: unknown;
}

export interface StructuredLogger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(component: string): StructuredLogger {
  function log(level: LogEntry["level"], msg: string, meta?: Record<string, unknown>) {
    const entry: LogEntry = { level, msg, ts: Date.now(), component, ...meta };
    // Append to NDJSON log
    const line = JSON.stringify(entry) + "\n";
    if (level === "error") {
      process.stderr.write(line);
    }
    // In production, also write to .oswarm/logs/ — for now, stderr only in debug
  }

  return {
    debug: (msg, meta) => log("debug", msg, meta),
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
  };
}
```

- [ ] **Step 2: Write key vault**

`src/providers/keys.ts`:
```typescript
import type { AgentHandle } from "../types/index.ts";

export interface KeyVault {
  get(key: string, agent?: AgentHandle): string | undefined;
  scope(keys: string[]): Record<string, string>;
  audit(): Array<{ key: string; agentId: string; timestamp: number }>;
}

export function createKeyVault(): KeyVault {
  const accessLog: Array<{ key: string; agentId: string; timestamp: number }> = [];

  return {
    get(key: string, agent?: AgentHandle): string | undefined {
      const value = process.env[key];
      if (value && agent) {
        accessLog.push({ key, agentId: agent.id, timestamp: Date.now() });
      }
      return value;
    },

    scope(keys: string[]): Record<string, string> {
      const result: Record<string, string> = {};
      for (const key of keys) {
        const val = process.env[key];
        if (val) result[key] = val;
      }
      return result;
    },

    audit() {
      return [...accessLog];
    },
  };
}
```

- [ ] **Step 3: Write providers barrel**

`src/providers/index.ts`:
```typescript
import { createLogger, type StructuredLogger } from "./logger.ts";
import { createKeyVault, type KeyVault } from "./keys.ts";
export type { StructuredLogger } from "./logger.ts";
export type { KeyVault } from "./keys.ts";

export interface Providers {
  logger: StructuredLogger;
  keys: KeyVault;
}

export function createProviders(component: string): Providers {
  return {
    logger: createLogger(component),
    keys: createKeyVault(),
  };
}
```

- [ ] **Step 4: Run type check + structural test**

Run: `bun run tsc --noEmit && bun test tests/structure.test.ts`
Expected: Both pass

- [ ] **Step 5: Commit**

```bash
git add src/providers/
git commit -m "providers: structured logger + key vault"
```

### Task 5: Protocol layer (message bus)

**Files:**
- Create: `src/protocol/bus.ts`
- Create: `src/protocol/store.ts`
- Create: `src/protocol/index.ts`
- Create: `tests/bus.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/bus.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { createMessageBus } from "../src/protocol/bus.ts";

test("emits and receives events", () => {
  const bus = createMessageBus();
  const received: string[] = [];

  bus.on("agent_event", (evt) => {
    received.push(evt.type);
  });

  bus.emit("agent_event", {
    type: "progress",
    agentId: "a1",
    taskId: "t1",
    timestamp: Date.now(),
    data: {},
  });

  expect(received).toEqual(["progress"]);
});

test("wildcard listener receives all events", () => {
  const bus = createMessageBus();
  const received: string[] = [];

  bus.on("*", (evt) => {
    received.push(evt.type);
  });

  bus.emit("agent_event", {
    type: "progress",
    agentId: "a1",
    taskId: "t1",
    timestamp: Date.now(),
    data: {},
  });

  bus.emit("task_update", {
    type: "complete",
    agentId: "a1",
    taskId: "t1",
    timestamp: Date.now(),
    data: {},
  });

  expect(received).toEqual(["progress", "complete"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/bus.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write message bus**

`src/protocol/bus.ts`:
```typescript
import type { AgentEvent } from "../types/index.ts";

export type BusEventType = "agent_event" | "task_update" | "escalation" | "task_failed" | "*";
type Listener = (event: AgentEvent) => void;

export interface MessageBus {
  on(type: BusEventType, listener: Listener): () => void;
  emit(type: BusEventType, event: AgentEvent): void;
  removeAllListeners(): void;
}

export function createMessageBus(): MessageBus {
  const listeners = new Map<BusEventType, Set<Listener>>();

  return {
    on(type: BusEventType, listener: Listener): () => void {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
      return () => listeners.get(type)?.delete(listener);
    },

    emit(type: BusEventType, event: AgentEvent): void {
      // Deliver to specific listeners
      listeners.get(type)?.forEach((fn) => fn(event));
      // Deliver to wildcard listeners
      if (type !== "*") {
        listeners.get("*")?.forEach((fn) => fn(event));
      }
    },

    removeAllListeners(): void {
      listeners.clear();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/bus.test.ts`
Expected: PASS

- [ ] **Step 5: Write persistent store**

`src/protocol/store.ts` — writes events to `.oswarm/` as NDJSON:
```typescript
import type { AgentEvent } from "../types/index.ts";

export interface EventStore {
  append(event: AgentEvent): Promise<void>;
  read(taskId?: string): Promise<AgentEvent[]>;
}

export function createEventStore(oswarmDir: string): EventStore {
  const eventsPath = `${oswarmDir}/events.ndjson`;

  return {
    async append(event: AgentEvent): Promise<void> {
      const line = JSON.stringify(event) + "\n";
      await Bun.write(eventsPath, line, { append: true });
    },

    async read(taskId?: string): Promise<AgentEvent[]> {
      const file = Bun.file(eventsPath);
      if (!(await file.exists())) return [];

      const text = await file.text();
      const events = text
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AgentEvent);

      if (taskId) return events.filter((e) => e.taskId === taskId);
      return events;
    },
  };
}
```

- [ ] **Step 6: Write protocol barrel**

`src/protocol/index.ts`:
```typescript
export { createMessageBus, type MessageBus, type BusEventType } from "./bus.ts";
export { createEventStore, type EventStore } from "./store.ts";
```

- [ ] **Step 7: Run all tests + structural test**

Run: `bun test`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/protocol/ tests/bus.test.ts
git commit -m "protocol: message bus with wildcard support + NDJSON event store"
```

---

## Chunk 3: Claude Code Adapter + Agent Spawning

### Task 6: Install Claude Agent SDK

- [ ] **Step 1: Install dependency**

```bash
bun add @anthropic-ai/claude-agent-sdk
```

- [ ] **Step 2: Commit lockfile**

```bash
git add package.json bun.lock
git commit -m "deps: add @anthropic-ai/claude-agent-sdk"
```

### Task 7: Adapter interface + Claude Code adapter

**Files:**
- Create: `src/adapters/interface.ts`
- Create: `src/adapters/cc.ts`
- Create: `src/adapters/index.ts`
- Create: `tests/adapters/cc.test.ts`

- [ ] **Step 1: Write adapter interface**

`src/adapters/interface.ts`:
```typescript
import type {
  AgentHandle,
  AgentEvent,
  HealthStatus,
  SpawnManifest,
} from "../types/index.ts";

export interface AgentAdapter {
  readonly type: string;

  spawn(manifest: SpawnManifest): Promise<AgentHandle>;

  send(
    handle: AgentHandle,
    message: string
  ): AsyncGenerator<AgentEvent, void, unknown>;

  kill(handle: AgentHandle): Promise<void>;

  health(handle: AgentHandle): Promise<HealthStatus>;
}
```

- [ ] **Step 2: Write Claude Code adapter**

`src/adapters/cc.ts`:
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentAdapter } from "./interface.ts";
import type {
  AgentHandle,
  AgentEvent,
  HealthStatus,
  SpawnManifest,
} from "../types/index.ts";
import type { Providers } from "../providers/index.ts";

export function createCCAdapter(providers: Providers): AgentAdapter {
  const { logger } = providers;
  const handles = new Map<string, { pid?: number; abortController: AbortController }>();

  return {
    type: "cc",

    async spawn(manifest: SpawnManifest): Promise<AgentHandle> {
      const handle: AgentHandle = {
        id: `cc-${crypto.randomUUID().slice(0, 8)}`,
        adapter: "cc",
        taskId: manifest.task.id,
        worktree: manifest.worktreePath,
      };

      handles.set(handle.id, { abortController: new AbortController() });
      logger.info("agent spawned", { agentId: handle.id, taskId: manifest.task.id });
      return handle;
    },

    async *send(
      handle: AgentHandle,
      message: string
    ): AsyncGenerator<AgentEvent, void, unknown> {
      const state = handles.get(handle.id);
      if (!state) throw new Error(`Unknown agent: ${handle.id}`);

      logger.info("sending to agent", { agentId: handle.id, message: message.slice(0, 100) });

      try {
        const result = query({
          prompt: message,
          options: {
            permissionMode: "dangerouslySkipPermissions",
            cwd: handle.worktree,
            abortSignal: state.abortController.signal,
          },
        });

        for await (const msg of result) {
          const event: AgentEvent = {
            type: "progress",
            agentId: handle.id,
            taskId: handle.taskId,
            timestamp: Date.now(),
            data: { message: msg },
          };

          // Extract reasoning if present
          if (typeof msg === "object" && msg !== null && "type" in msg) {
            const m = msg as Record<string, unknown>;
            if (m.type === "assistant" && typeof m.content === "string") {
              // Check for thinking blocks
              const thinkMatch = /<thinking>([\s\S]*?)<\/thinking>/g.exec(
                m.content as string
              );
              if (thinkMatch) {
                yield {
                  type: "reasoning",
                  agentId: handle.id,
                  taskId: handle.taskId,
                  timestamp: Date.now(),
                  data: { content: thinkMatch[1] },
                };
              }
            }
          }

          yield event;
        }

        yield {
          type: "complete",
          agentId: handle.id,
          taskId: handle.taskId,
          timestamp: Date.now(),
          data: {},
        };
      } catch (err) {
        yield {
          type: "error",
          agentId: handle.id,
          taskId: handle.taskId,
          timestamp: Date.now(),
          data: { error: String(err) },
        };
      }
    },

    async kill(handle: AgentHandle): Promise<void> {
      const state = handles.get(handle.id);
      if (state) {
        state.abortController.abort();
        handles.delete(handle.id);
        logger.info("agent killed", { agentId: handle.id });
      }
    },

    async health(handle: AgentHandle): Promise<HealthStatus> {
      const alive = handles.has(handle.id);
      return {
        alive,
        lastHeartbeat: Date.now(),
      };
    },
  };
}
```

- [ ] **Step 3: Write adapter barrel**

`src/adapters/index.ts`:
```typescript
export type { AgentAdapter } from "./interface.ts";
export { createCCAdapter } from "./cc.ts";
```

- [ ] **Step 4: Run type check + structural test**

Run: `bun run tsc --noEmit && bun test tests/structure.test.ts`
Expected: Both pass. The adapter imports from types and providers (lower layers) — no violations.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/
git commit -m "adapters: CC adapter wrapping claude-agent-sdk query()"
```

### Task 8: Worktree manager

**Files:**
- Create: `src/engine/worktree.ts`
- Create: `tests/worktree.test.ts`

- [ ] **Step 1: Write failing test**

`tests/worktree.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { WorktreeManager } from "../src/engine/worktree.ts";

test("creates and lists worktrees", async () => {
  // This test is integration-level — it actually creates git worktrees
  // Only run if we're in a git repo
  const result = await Bun.$`git rev-parse --git-dir`.quiet();
  if (result.exitCode !== 0) {
    console.log("Skipping: not in a git repo");
    return;
  }

  const mgr = new WorktreeManager(".worktrees");
  const testBranch = `test-wt-${Date.now()}`;

  try {
    const path = await mgr.create(testBranch);
    expect(path).toContain(testBranch);

    const list = await mgr.list();
    expect(list.some((w) => w.branch.includes(testBranch))).toBe(true);
  } finally {
    await mgr.remove(testBranch);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/worktree.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write worktree manager**

`src/engine/worktree.ts`:
```typescript
export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

export class WorktreeManager {
  constructor(private baseDir: string) {}

  async create(branchName: string): Promise<string> {
    const path = `${this.baseDir}/${branchName}`;
    const result = await Bun.$`git worktree add ${path} -b ${branchName}`.quiet();
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create worktree: ${result.stderr.toString()}`);
    }
    return path;
  }

  async remove(branchName: string): Promise<void> {
    const path = `${this.baseDir}/${branchName}`;
    await Bun.$`git worktree remove ${path} --force`.quiet();
    await Bun.$`git branch -D ${branchName}`.quiet();
  }

  async list(): Promise<WorktreeInfo[]> {
    const result = await Bun.$`git worktree list --porcelain`.quiet();
    const text = result.stdout.toString();
    const entries: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of text.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) entries.push(current as WorktreeInfo);
        current = { path: line.slice(9) };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice(5);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice(7);
      }
    }
    if (current.path) entries.push(current as WorktreeInfo);

    return entries;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/worktree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/worktree.ts tests/worktree.test.ts
git commit -m "engine: worktree manager for isolated agent workspaces"
```

---

## Chunk 4: DAG Executor + Wiring to TUI

### Task 9: DAG executor (simple topological)

**Files:**
- Create: `src/engine/dag.ts`
- Create: `tests/dag.test.ts`

- [ ] **Step 1: Write failing test**

`tests/dag.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { DAGExecutor } from "../src/engine/dag.ts";
import type { TaskDAG, TaskNode, AgentEvent } from "../src/types/index.ts";

function makeNode(id: string, deps: string[] = []): TaskNode {
  return {
    id,
    goal: `task ${id}`,
    isolation: "shared",
    adapter: "cc",
    model: "sonnet",
    contextRequirements: [],
    exitCriteria: { tests_pass: false, linter_clean: false, review_required: false },
    estimatedComplexity: "trivial",
    status: "pending",
  };
}

test("executes independent tasks in parallel", async () => {
  const dag: TaskDAG = {
    nodes: [makeNode("a"), makeNode("b"), makeNode("c")],
    edges: [],
  };

  const executor = new DAGExecutor(dag, 3);
  const ready = executor.getReady();
  expect(ready.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
});

test("respects dependencies", () => {
  const dag: TaskDAG = {
    nodes: [makeNode("a"), makeNode("b"), makeNode("c")],
    edges: [
      { from: "a", to: "b", type: "blocks" },
      { from: "b", to: "c", type: "blocks" },
    ],
  };

  const executor = new DAGExecutor(dag, 3);
  const ready = executor.getReady();
  expect(ready.map((n) => n.id)).toEqual(["a"]);

  executor.complete("a", true);
  const next = executor.getReady();
  expect(next.map((n) => n.id)).toEqual(["b"]);
});

test("marks downstream as blocked on failure", () => {
  const dag: TaskDAG = {
    nodes: [makeNode("a"), makeNode("b"), makeNode("c")],
    edges: [
      { from: "a", to: "b", type: "blocks" },
    ],
  };

  const executor = new DAGExecutor(dag, 3);
  executor.complete("a", false); // a fails

  const ready = executor.getReady();
  // b should be blocked, c should be ready
  expect(ready.map((n) => n.id)).toEqual(["c"]);

  const bNode = dag.nodes.find((n) => n.id === "b")!;
  expect(bNode.status).toBe("blocked");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/dag.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write DAG executor**

`src/engine/dag.ts`:
```typescript
import type { TaskDAG, TaskNode } from "../types/index.ts";

export class DAGExecutor {
  private running = new Set<string>();

  constructor(
    private dag: TaskDAG,
    private maxConcurrency: number
  ) {}

  getReady(): TaskNode[] {
    const available = this.dag.nodes.filter((node) => {
      if (node.status !== "pending") return false;
      if (this.running.size >= this.maxConcurrency) return false;

      // Check all blocking dependencies are completed
      const blockers = this.dag.edges.filter(
        (e) => e.to === node.id && e.type === "blocks"
      );
      return blockers.every((dep) => {
        const depNode = this.dag.nodes.find((n) => n.id === dep.from);
        return depNode?.status === "completed";
      });
    });

    return available;
  }

  start(taskId: string): void {
    const node = this.dag.nodes.find((n) => n.id === taskId);
    if (!node) throw new Error(`Unknown task: ${taskId}`);
    node.status = "running";
    this.running.add(taskId);
  }

  complete(taskId: string, success: boolean): void {
    const node = this.dag.nodes.find((n) => n.id === taskId);
    if (!node) throw new Error(`Unknown task: ${taskId}`);

    node.status = success ? "completed" : "failed";
    this.running.delete(taskId);

    if (!success) {
      // Mark downstream blocked
      const downstream = this.getDownstream(taskId);
      for (const id of downstream) {
        const n = this.dag.nodes.find((x) => x.id === id);
        if (n && n.status === "pending") {
          n.status = "blocked";
        }
      }
    }
  }

  private getDownstream(taskId: string): string[] {
    const direct = this.dag.edges
      .filter((e) => e.from === taskId && e.type === "blocks")
      .map((e) => e.to);

    const all = new Set(direct);
    for (const id of direct) {
      for (const sub of this.getDownstream(id)) {
        all.add(sub);
      }
    }
    return [...all];
  }

  isComplete(): boolean {
    return this.dag.nodes.every(
      (n) => n.status === "completed" || n.status === "failed" || n.status === "blocked"
    );
  }

  summary(): { completed: number; failed: number; blocked: number; pending: number; running: number } {
    const counts = { completed: 0, failed: 0, blocked: 0, pending: 0, running: 0 };
    for (const node of this.dag.nodes) {
      counts[node.status]++;
    }
    return counts;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/dag.test.ts`
Expected: PASS

- [ ] **Step 5: Write engine barrel**

`src/engine/index.ts`:
```typescript
export { DAGExecutor } from "./dag.ts";
export { WorktreeManager } from "./worktree.ts";
```

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: All pass (structure, bus, dag, worktree)

- [ ] **Step 7: Commit**

```bash
git add src/engine/ tests/dag.test.ts
git commit -m "engine: DAG executor with dependency resolution and failure propagation"
```

### Task 10: Wire TUI to real message bus

**Files:**
- Modify: `src/tui/App.tsx`
- Modify: `src/cli.tsx`
- Create: `src/orchestrator.ts`

- [ ] **Step 1: Create orchestrator entry point**

`src/orchestrator.ts` — ties everything together:
```typescript
import { createProviders, type Providers } from "./providers/index.ts";
import { createMessageBus, type MessageBus } from "./protocol/index.ts";
import { createCCAdapter } from "./adapters/index.ts";
import { loadConfig, type OswarmConfig } from "./config/index.ts";
import { DAGExecutor } from "./engine/index.ts";
import type { AgentEvent, SwarmState, TaskDAG } from "./types/index.ts";

export interface Orchestrator {
  config: OswarmConfig;
  bus: MessageBus;
  providers: Providers;
  state: SwarmState;
  onStateChange: (listener: (state: SwarmState) => void) => () => void;
}

export async function createOrchestrator(rootDir: string): Promise<Orchestrator> {
  const config = await loadConfig(rootDir);
  const providers = createProviders("orchestrator");
  const bus = createMessageBus();
  const ccAdapter = createCCAdapter(providers);

  const state: SwarmState = {
    tasks: [],
    agents: [],
    reasoning: [],
    totalCost: 0,
    startTime: Date.now(),
  };

  const stateListeners = new Set<(state: SwarmState) => void>();

  function notifyStateChange() {
    for (const listener of stateListeners) {
      listener({ ...state });
    }
  }

  // Listen for events and update state
  bus.on("agent_event", (event: AgentEvent) => {
    if (event.type === "reasoning") {
      state.reasoning.push({
        agentId: event.agentId,
        timestamp: event.timestamp,
        content: (event.data.content as string) ?? "",
      });
      notifyStateChange();
    }
  });

  providers.logger.info("orchestrator initialized", { rootDir });

  return {
    config,
    bus,
    providers,
    state,
    onStateChange: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  };
}
```

- [ ] **Step 2: Update cli.tsx to use orchestrator**

`src/cli.tsx`:
```typescript
import React from "react";
import { render } from "ink";
import { App } from "./tui/App.tsx";
import { createMockState } from "./mock.ts";
import { createOrchestrator } from "./orchestrator.ts";

export async function startWatch(useMock = true) {
  if (useMock) {
    // Mock mode for development
    const state = createMockState();
    const { waitUntilExit } = render(<App initialState={state} />);
    await waitUntilExit();
  } else {
    // Real orchestrator mode
    const orchestrator = await createOrchestrator(process.cwd());
    const { waitUntilExit } = render(
      <App initialState={orchestrator.state} />
    );
    // Wire state updates to re-render
    orchestrator.onStateChange(() => {
      // Ink re-renders on state change via React state — will wire in next plan
    });
    await waitUntilExit();
  }
}

if (import.meta.main) {
  const useMock = process.argv.includes("--mock");
  await startWatch(useMock);
}
```

- [ ] **Step 3: Update cli.ts to pass --mock flag**

In `cli.ts`, update the watch command:
```typescript
  watch: async () => {
    const { startWatch } = await import("./src/cli.tsx");
    const useMock = process.argv.includes("--mock");
    await startWatch(useMock);
  },
```

- [ ] **Step 4: Run type check + all tests**

Run: `bun run tsc --noEmit && bun test`
Expected: All pass

- [ ] **Step 5: Verify TUI still works with mock data**

Run: `bun cli.ts watch --mock`
Expected: TUI renders with mock task tree, agent feed, reasoning stream. Press `q` to quit.

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator.ts src/cli.tsx cli.ts
git commit -m "feat: orchestrator entry point wiring config, providers, bus, and adapters"
```

---

## Verification

After completing all tasks:

1. **Run full test suite:** `bun test`
   - Expected: All tests pass (structure, bus, dag, worktree)

2. **Run type check:** `bun run tsc --noEmit`
   - Expected: 0 errors

3. **Run TUI:** `bun cli.ts watch --mock`
   - Expected: Renders correctly

4. **Verify layer structure:**
   ```
   src/
   ├── types/index.ts          # Layer 0
   ├── config/                  # Layer 1
   │   ├── schema.ts
   │   ├── defaults.ts
   │   └── index.ts
   ├── providers/               # Layer 2
   │   ├── logger.ts
   │   ├── keys.ts
   │   └── index.ts
   ├── protocol/                # Layer 3
   │   ├── bus.ts
   │   ├── store.ts
   │   └── index.ts
   ├── engine/                  # Layer 4
   │   ├── dag.ts
   │   ├── worktree.ts
   │   └── index.ts
   ├── adapters/                # Layer 5
   │   ├── interface.ts
   │   ├── cc.ts
   │   └── index.ts
   ├── orchestrator.ts          # Wiring
   ├── tui/                     # UI (existing)
   └── mock.ts                  # Dev tooling
   ```

5. **Verify structural test catches violations:**
   Add a temporary `import "../adapters"` to a types file, run `bun test tests/structure.test.ts`, verify it fails, then remove it.
