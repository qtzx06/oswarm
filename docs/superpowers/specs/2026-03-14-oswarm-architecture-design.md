# oswarm Architecture Design

> **Harness engineering** is the practice of designing environments, feedback loops, and control systems that help coding agents accomplish reliable work at scale. The term comes from [OpenAI's Codex team](https://openai.com/index/harness-engineering/), who shipped a million-line codebase with 0 manually-written code by investing in scaffolding, constraints, and agent legibility rather than writing code directly.

## What oswarm IS

oswarm is a tasteful multi-agent conductor framework (Bun/TS) that:

- Spawns fleets of coding agents (Claude Code via Agent SDK, Codex/OpenClaw/others via ACP) — each ACP connection is a 1:1 client-agent session; oswarm manages N concurrent sessions to achieve fleet behavior
- Each agent gets its own worktree, context, and sub-agents
- The orchestrator encodes *taste* — smart decomposition, progressive context disclosure, Ralph Loop review cycles, quality grading, entropy management
- Built using harness engineering principles (the framework is its own first customer)

**Distribution model:**
- `bun add oswarm` — the framework core (Types through Engine layers) as an npm package for programmatic use
- Skills (SKILL.md files) — installable in CC (`~/.claude/skills/`) and OpenClaw (`./skills/`) for agent-native orchestration
- The skills are thin wrappers that invoke the framework core

**Core differentiator:** Nobody has shipped a portable, reusable version of what OpenAI hand-built for their internal codebase. oswarm makes harness engineering patterns *framework-level primitives*.

**Positioning vs. Claude Code Agent Teams:** Agent Teams provides basic team lead + teammate coordination with a shared task list. oswarm is a superset — it can use Agent Teams as one execution backend, but adds cross-model orchestration, taste-spec enforcement, Ralph Loop review, quality grading, and harness management that Agent Teams does not provide.

---

## Layered Architecture

oswarm's codebase uses strict dependency layers (left-to-right only, enforced by structural tests + custom linter):

```
Types → Config → Providers → Protocol → Engine → Adapters → Skills → CLI
```

| Layer | Purpose |
|-------|---------|
| **Types** | Shared interfaces, message schemas, agent capability descriptors |
| **Config** | Repository harness config, agent pool config, orchestration rules, schema versioning |
| **Providers** | Cross-cutting concerns: telemetry (OTLP), auth (KeyVault), logging (structured), feature flags. Single explicit interface that other layers import. |
| **Protocol** | Message bus, ACP message types, event definitions, hook contracts |
| **Engine** | The conductor brain: task decomposer, Ralph Loop runner, context router, quality grader, entropy detector |
| **Adapters** | Claude Code (Agent SDK), OpenClaw (ACPX), Codex (ACPX), Cloud (E2B/Fly.io/Modal) |
| **Skills** | SKILL.md files: oswarm-orchestrate, oswarm-worker, oswarm-observe, oswarm-review, oswarm-research |
| **CLI** | `oswarm init`, `oswarm run`, `oswarm status`, `oswarm observe` |

### Providers Layer

```typescript
interface Providers {
  telemetry: TelemetryProvider    // OTLP export, span creation, metric recording
  keys: KeyVault                  // Scoped API key access (see Skill Discovery section)
  logger: StructuredLogger        // Structured JSON logging, no console.log
  flags: FeatureFlagProvider      // Runtime feature toggles
}
```

All layers from Protocol onward receive Providers via dependency injection. Adapters and Engine never instantiate their own logging/telemetry — they use the injected provider.

---

## The Conductor Engine ("Taste" Layer)

Five subsystems that together encode orchestration judgment:

### Task Decomposer

Takes a high-level goal and produces a DAG of subtasks.

**Mechanism:** LLM-driven decomposition. The orchestrator calls a design-capable model (e.g., Opus) with the goal + repo context (AGENTS.md, relevant docs/, current QUALITY_SCORE.md). The model outputs a structured DAG.

**DAG data structure:**
```typescript
interface TaskDAG {
  nodes: TaskNode[]
  edges: Dependency[]  // { from: TaskId, to: TaskId, type: "blocks" | "informs" }
}

interface TaskNode {
  id: TaskId
  goal: string                          // what this subtask accomplishes
  isolation: "worktree" | "shared"      // worktree = git worktree, shared = same working dir
  adapter: AdapterType                  // which agent backend
  model: ModelHint                      // opus | sonnet | haiku | codex | any
  contextRequirements: string[]         // doc paths, schema refs to inject
  exitCriteria: ExitCriteria            // how we know it's done
  estimatedComplexity: "trivial" | "moderate" | "complex"  // informs review requirements
}

interface ExitCriteria {
  tests_pass: boolean
  linter_clean: boolean
  review_required: boolean              // goes through Ralph Loop?
  custom?: string                       // freeform acceptance criteria
}
```

**Routing heuristics (taste decisions):**
- `trivial` tasks → Sonnet/Haiku, no review required, shared worktree OK
- `moderate` tasks → Sonnet, review recommended, own worktree
- `complex` tasks → Opus or design-first spawning (see below), review required, own worktree
- Tasks touching security/auth → always Opus, always reviewed, inject SECURITY.md

**DAG execution:** The Engine runs a simple topological executor — ready nodes (no unresolved `blocks` dependencies) are dispatched in parallel up to the concurrency limit. See Concurrency Model section.

### Context Router (Progressive Disclosure)

Implements the "map not manual" pattern.

**Mechanism:** Prompt construction. When spawning an agent, the Context Router builds the system prompt by:
1. Always including AGENTS.md (~100 lines of markdown — a routing table pointing to docs/)
2. Resolving `contextRequirements` from the TaskNode → reading those file paths → injecting as prompt content
3. If the task involves debugging: appending recent linter output, test failure logs, relevant traces
4. If the task involves a specific domain: appending that domain's section from ARCHITECTURE.md

**Token budget:** Context injection targets ~4,000 tokens (roughly 100 lines of markdown). If resolved docs exceed this, the router truncates to headers + summaries and adds "read the full doc at <path>" pointers, trusting the agent to use its Read tool.

**What "structured docs/ references" look like:** File paths in the repo. The agent receives `"For auth patterns, see docs/design-docs/auth-patterns.md"` and uses its file-reading capability to access it when needed.

### Ralph Loop Runner

Orchestrates the review-iterate cycle:
- Agent A produces work → Agent B reviews → Agent A responds → iterate until consensus
- Configurable reviewer selection (same model? different model? specialized reviewer?)
- Exit criteria: all reviewers satisfied, OR escalate to human after N iterations (default N=5)
- Captures decision logs as first-class artifacts (checked into repo at `.oswarm/decisions/`)

**Escalation interface:** When the Ralph Loop exceeds max iterations, the runner:
1. Writes a summary of the disagreement to `.oswarm/escalations/<task-id>.md`
2. Emits an `escalation` event on the message bus
3. Pauses the task (status: `blocked_on_human`)
4. If CLI is active: prints escalation prompt to terminal
5. If running headless: sends notification via configured webhook (Slack, email, etc.)

### Quality Grader

Tracks codebase health per domain and layer:
- Structural test results
- Linter compliance
- Test coverage
- Doc freshness
- Pattern consistency scores
- Produces a `QUALITY_SCORE.md` that agents can read

### Entropy Manager ("Garbage Collection")

Periodic background agents that:
- Scan for doc drift (docs don't match code)
- Detect pattern violations and inconsistencies
- Open fix-up PRs automatically
- Track tech debt in `docs/exec-plans/tech-debt-tracker.md`

---

## Concurrency Model

### Resource Limits

```typescript
interface ConcurrencyConfig {
  maxAgents: number            // default: 8 (adjustable per machine)
  maxWorktrees: number         // default: 12
  memoryBudgetMb: number       // total memory budget for agent subprocesses
  cpuCores: number             // auto-detected, used for scheduling
}
```

The DAG executor maintains a semaphore capped at `maxAgents`. Ready nodes queue up and dispatch as slots free.

### Worktree Conflict Resolution

- **`isolation: "worktree"` tasks** (default for moderate/complex): Each gets a dedicated git worktree via `git worktree add`. No conflicts possible — agents work on isolated copies.
- **`isolation: "shared"` tasks** (trivial tasks only): Run in sequence, not parallel. The DAG executor treats shared-worktree tasks as having an implicit dependency chain.
- **Integration:** When worktree tasks complete, changes are merged back to the base branch. If merge conflicts arise, the orchestrator spawns a dedicated conflict-resolution agent with both diffs in context.

### DAG Failure Semantics

```
Task fails
    │
    ├─ Is it retryable? (transient error, flaky test)
    │   └─ Yes → retry up to 2 times with exponential backoff
    │   └─ No ↓
    │
    ├─ Are downstream tasks dependent?
    │   └─ Yes → mark downstream as `blocked`, continue independent branches
    │   └─ No → continue DAG execution
    │
    └─ Notify: emit `task_failed` event, log to `.oswarm/failures/<task-id>.md`
```

Partial DAG completion is the norm, not the exception. The orchestrator never cancels the entire DAG for a single failure — it completes what it can and reports the final state.

### Conductor Process Model

The conductor is a single Bun process using async/await for concurrency. Agent subprocesses (ACP stdio, Agent SDK) are child processes managed by the Adapters layer. No worker threads needed — the conductor is I/O-bound (waiting on agent responses), not CPU-bound.

---

## Failure Modes & Recovery

### Agent Crash (mid-task)

1. Adapter detects process exit / timeout (configurable, default 30 min per turn)
2. Worktree is preserved (not cleaned up) for inspection
3. Task status → `failed`, failure reason logged to `.oswarm/failures/`
4. If retryable: respawn agent in same worktree (work-in-progress preserved)
5. If not retryable: mark downstream tasks as blocked, notify human

### Cloud Adapter Failures

- **Fly.io machine eviction:** Adapter catches API error, retries on a new machine. Worktree state is lost (Fly.io Machines are ephemeral). Task restarts from scratch with a fresh worktree.
- **Modal function timeout (24h max):** Tasks exceeding timeout are decomposed further by the Task Decomposer into smaller subtasks.
- **E2B sandbox expiry:** Sessions last up to 24h (Pro). Long-running tasks checkpoint to `.oswarm/checkpoints/` before expiry and resume in a new sandbox.

### Ralph Loop Deadlock

If reviewers cycle (A approves, B rejects, A changes, B approves, A rejects...):
- Loop detector counts unique states. If a state repeats, it's a cycle.
- Escalation: pause, write disagreement summary, notify human.

### Message Bus Corruption

- `.oswarm/` uses atomic file writes (write to temp, rename) to prevent partial writes.
- NDJSON event logs are append-only and tolerant of truncation (last line may be partial, skip it).
- On detection of corruption: log warning, rebuild state from git history + agent transcripts.

### Resource Exhaustion

- Memory: if agent subprocesses exceed `memoryBudgetMb`, the least-recently-active agent is paused (SIGSTOP) until memory frees.
- Disk: worktrees are cleaned up after task completion. A background reaper removes worktrees older than 24h.
- Subprocess count: hard cap at `maxAgents`. Excess tasks queue.

---

## Agent Adapters

Each adapter implements a common interface (~200 lines each):

```typescript
interface AgentAdapter {
  spawn(task: Task, context: Context, worktree: WorktreePath): AgentHandle
  send(handle: AgentHandle, message: Message): AsyncIterator<AgentEvent>
  kill(handle: AgentHandle): void
  health(handle: AgentHandle): HealthStatus
  getTranscript(handle: AgentHandle): ReasoningTrace[]
}
```

| Adapter | Mechanism | Notes |
|---------|-----------|-------|
| Claude Code | Agent SDK `query()` | Full async iterator, hooks. Primary local adapter. |
| OpenClaw | ACPX `sessions_spawn` | Queue owner pattern, permission modes |
| Codex | ACPX | ACP JSON-RPC over stdio. Note: ACPX registry is hardcoded to 13 agents. |
| Cloud (E2B) | E2B SDK | Official CC templates, Firecracker microVMs, ~150ms boot. Best for safe execution. |
| Cloud (Fly.io) | Machines API | WireGuard mesh for inter-agent comms. Best for networked swarms. |
| Cloud (Modal) | `modal.Function` | GPU workloads, gVisor isolation. Best for ML tasks. |

### ACP Constraint: 1:1 Sessions

ACP is a client-to-agent protocol, not an orchestration protocol. Each ACP connection is a single 1:1 session over stdio. oswarm achieves fleet behavior by managing N concurrent ACP subprocess connections. This is oswarm's core value — building multi-agent orchestration on top of ACP's 1:1 primitive.

### Cloud Sandbox Constraint

Sandboxed sessions (E2B, Modal) cannot spawn ACP sessions because ACP runs on the host. Cloud adapters work differently:
- The orchestrator runs on the host and manages ACP connections locally
- Cloud sandboxes are used as **execution environments** — the agent's code runs in the sandbox, but the agent process (CC, Codex) runs on the host or in a host-adjacent VM
- For fully remote execution: Fly.io Machines can run agent processes directly (not sandboxed, full host access per machine)

---

## Message Bus & Observability

### Message Bus

Hybrid approach — filesystem for durability, events for speed:
- **`.oswarm/`** directory — task state, decision logs, agent transcripts (durable)
- **EventEmitter** — real-time agent events, progress updates (ephemeral)
- **Hook Collector** — intercepts CC/OpenClaw hooks for lifecycle events

### Reasoning Observer (Core Differentiator)

What makes oswarm unique vs. just "another orchestrator":
- Tails agent transcripts in real-time
- Extracts reasoning chains from agent output (Claude: `<thinking>` blocks; other models: chain-of-thought patterns in output; models without visible reasoning: inferred from tool-use sequences)
- Correlates reasoning across agents by matching shared entity references (file paths, function names, error messages) and temporal proximity
- Builds decision graphs stored as NDJSON in `.oswarm/decisions/` — queryable by task, agent, or time range
- Feeds reasoning traces back into the Ralph Loop for richer review context

### Telemetry

- OTLP export (OpenTelemetry) — single collector endpoint with worktree/agent/task labels on all spans
- Plugs into CC's existing OTLP export (`CLAUDE_CODE_ENABLE_TELEMETRY=1`)
- `oswarm observe` CLI for live terminal dashboard (spans, agent status, task progress)

---

## Skill Discovery & Tasteful Inheritance

### Skill Search & Registry

Skill search across agent ecosystems:

```typescript
interface SkillRegistry {
  search(query: string): Skill[]
  resolve(name: string): Skill
  install(skill: Skill, target: Agent): void
  sources: SkillSource[]
}
```

| Source | Mechanism | Format | Notes |
|--------|-----------|--------|-------|
| ClawHub | REST API + vector search | SKILL.md + YAML frontmatter | 2,800+ community skills |
| CC Skills | `~/.claude/skills/` glob | Markdown files | Local installed skills |
| Workspace Skills | `./skills/` | Markdown files | Project-local skills |
| Superpowers | Plugin cache scan | SKILL.md | Brainstorming, TDD, debugging, etc. |

Each source has its own `SkillSource` adapter that normalizes metadata into a common `Skill` type. Sources with fundamentally different formats (npm packages, etc.) are out of scope for v1 — the registry focuses on SKILL.md-compatible formats.

### Context Inheritance Chain

When the orchestrator spawns an agent, it builds an inheritance manifest:

```
Orchestrator Context
├── API Keys (filtered by task type — see KeyVault)
├── Skills (matched to task type via SkillRegistry search)
├── Permissions (scoped — least privilege per task)
├── Docs slice (progressive disclosure — only relevant docs/)
├── AGENTS.md (always, as the map)
└── Taste specs (architectural rules, linter config, golden principles)
```

The key: **not everything inherits**. The orchestrator makes taste decisions about what each agent gets.

### Design-First Spawning ("Taste Specs")

Before an agent builds, another agent designs:

```
Goal arrives
    │
    ▼
Orchestrator decides "this needs design before execution"
(based on estimatedComplexity: "complex" tasks always get design-first)
    │
    ▼
Design Agent (Opus, brainstorming skill, full docs/)
    │ Outputs: exec-plan.md, taste-spec.yaml, subtask DAG
    ▼
Orchestrator reviews design (may Ralph Loop it)
    │
    ├──────────────┐
    ▼              ▼
Exec Agent A    Exec Agent B
(worktree-1)    (worktree-2)
Each gets: taste-spec, its slice, API keys, linters
```

The **taste-spec** is the key artifact:

```yaml
# taste-spec.yaml
architecture:
  layer: Service
  domain: auth
  allowed_dependencies: [Types, Config, Repo]

patterns:
  - validate_boundaries: true
  - structured_logging: true
  - test_coverage_min: 80

style:
  prefer: "boring technology"
  avoid: "opaque dependencies"

context:
  inject_docs: [docs/SECURITY.md, docs/design-docs/auth-patterns.md]
  inject_skills: [superpowers:test-driven-development]

review:
  ralph_loop: true
  min_reviewers: 2
  exit_criteria: "all reviewers approve + structural tests pass"
```

### API Key Vault

Centralized, scoped API key management:

```typescript
interface KeyVault {
  get(key: string, agent: AgentHandle): string | null
  scope(keys: string[], task: Task): ScopedKeySet
  rotate(key: string): void
  audit(): KeyAccessLog[]
}
```

**Storage:** Keys are read from environment variables and `.oswarm/secrets.env` (gitignored). Never stored in plain YAML config. For cloud adapters, keys are injected as environment variables into the sandbox/machine at spawn time.

Agents never see keys they don't need. The orchestrator filters based on adapter type and task domain.

---

## Harness Bootstrap (`oswarm init`)

Sets up a harness-engineered repository structure:

```
AGENTS.md              (~100 lines, routing table only)
ARCHITECTURE.md        (domain map + layer rules)
docs/
├── design-docs/
│   ├── index.md
│   └── core-beliefs.md
├── exec-plans/
│   ├── active/
│   ├── completed/
│   └── tech-debt-tracker.md
├── generated/
├── product-specs/
│   └── index.md
├── references/
├── QUALITY_SCORE.md
├── RELIABILITY.md
└── SECURITY.md
.oswarm/
├── config.yaml         (schema version field for migration)
├── linters/
├── skills/
└── .gitignore          (secrets.env, checkpoints/, failures/)
```

Plus:
- Structural test enforcing layer dependencies
- Custom linter with remediation messages (agent-readable errors)
- Pre-commit hook for architectural validation
- Doc-gardening agent config (periodic entropy cleanup)

### Schema Versioning

All framework artifacts (config.yaml, taste-spec.yaml, QUALITY_SCORE.md) include a `schema_version` field. The CLI checks version compatibility at startup and runs migrations when needed:

```yaml
# .oswarm/config.yaml
schema_version: "1.0"
# ... rest of config
```

---

## Build Sequence (Approach C: Interleaved)

Harness and conductor grow together in lockstep:

1. **Harness skeleton** — AGENTS.md, docs/, layer rules, first structural test
2. **Agent spawn + worktree isolation** — first real capability via Claude Agent SDK
3. **Task decomposition engine** — goal → subtask DAG
4. **Context router** — progressive disclosure, skill matching
5. **Ralph Loop / review orchestration** — agent-to-agent review cycles
6. **Quality grader + entropy manager** — codebase health tracking
7. **Skill registry + inheritance** — unified skill search, tasteful spawning
8. **Design-first spawning** — taste-spec generation before execution
9. **Harness bootstrap tool** — `oswarm init` for user repos
10. **CLI + observability dashboard** — `oswarm run/status/observe`

Each step gets its own layer-compliant module, doc entry, and structural test.

---

## Key Design Decisions

- **Not a new protocol** — uses ACP (1:1 sessions) where it exists, Agent SDK for Claude Code, filesystem for persistence
- **MCP-transparent** — oswarm does not require its own MCP servers, but respects and propagates MCP configurations to agents that use them
- **Skills are the distribution mechanism** — install via ClawHub or .claude/skills/
- **Reasoning traces are first-class** — the core differentiator, not an afterthought
- **Cross-model by design** — SkillBoss/multi-model Ralph Loops built in
- **Local-first, cloud-burst** — runs on your machine, scales to E2B/Fly.io/Modal
- **Repository is the system of record** — all knowledge versioned in-repo
- **Constraints enable speed** — enforce boundaries centrally, allow autonomy locally
- **Superset of Agent Teams** — can use CC Agent Teams as a backend, adds orchestration taste on top
