import { createProviders, type Providers } from "./providers/index.ts";
import {
  createCCAdapter,
  createAcpxAdapter,
  type AgentAdapter,
} from "./adapters/index.ts";
import { loadConfig, type OswarmConfig } from "./config/index.ts";
import { DAGExecutor, WorktreeManager } from "./engine/index.ts";
import type {
  AdapterType,
  AgentEvent,
  SwarmState,
  TaskDAG,
  TaskNode,
  SpawnManifest,
} from "./types/index.ts";

export interface Orchestrator {
  config: OswarmConfig;
  providers: Providers;
  adapters: Map<string, AgentAdapter>;
  worktrees: WorktreeManager;
  state: SwarmState;
  run(goal: string): AsyncGenerator<AgentEvent, void, unknown>;
  onStateChange: (listener: (state: SwarmState) => void) => () => void;
}

export async function createOrchestrator(rootDir: string): Promise<Orchestrator> {
  const config = await loadConfig(rootDir);
  const providers = createProviders("orchestrator");

  // Build adapter pool based on config
  const adapters = new Map<string, AgentAdapter>();
  if (config.adapters.cc.enabled) {
    adapters.set("cc", createCCAdapter(providers));
  }
  if (config.adapters.codex.enabled) {
    adapters.set("codex", createAcpxAdapter("codex", providers));
  }
  if (config.adapters.openclaw.enabled) {
    adapters.set("openclaw", createAcpxAdapter("openclaw", providers));
  }

  const worktrees = new WorktreeManager(config.paths.worktreeDir);

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

  function getAdapter(type: AdapterType): AgentAdapter {
    const adapter = adapters.get(type);
    if (!adapter) {
      // Fallback to CC if available, otherwise first available
      const fallback = adapters.get("cc") ?? adapters.values().next().value;
      if (!fallback) throw new Error(`No adapters configured`);
      providers.logger.warn("adapter not found, using fallback", {
        requested: type,
        using: fallback.type,
      });
      return fallback;
    }
    return adapter;
  }

  async function* run(goal: string): AsyncGenerator<AgentEvent, void, unknown> {
    providers.logger.info("starting run", { goal });

    // For now: single-task DAG, one agent
    // TODO: LLM-driven decomposition into real DAG
    const taskNode: TaskNode = {
      id: `task-${crypto.randomUUID().slice(0, 8)}`,
      goal,
      isolation: "worktree",
      adapter: "cc",
      model: "sonnet",
      contextRequirements: [],
      exitCriteria: {
        tests_pass: true,
        linter_clean: false,
        review_required: false,
      },
      estimatedComplexity: "moderate",
      status: "pending",
    };

    const dag: TaskDAG = { nodes: [taskNode], edges: [] };
    const executor = new DAGExecutor(dag, config.concurrency.maxAgents);

    // Create worktree for isolation
    let worktreePath: string | undefined;
    if (taskNode.isolation === "worktree") {
      try {
        const branchName = `oswarm-${taskNode.id}`;
        worktreePath = await worktrees.create(branchName);
        providers.logger.info("worktree created", { path: worktreePath });
      } catch (err) {
        providers.logger.warn("worktree creation failed, using cwd", {
          error: String(err),
        });
      }
    }

    const adapter = getAdapter(taskNode.adapter);
    const manifest: SpawnManifest = {
      task: taskNode,
      contextInjection: goal,
      worktreePath,
      apiKeys: {},
      permissions: "full",
    };

    const handle = await adapter.spawn(manifest);
    executor.start(taskNode.id);

    // Update TUI state
    state.agents.push({
      id: handle.id,
      backend: taskNode.adapter === "cc" ? "cc" : "codex",
      worktree: worktreePath,
      currentAction: "starting...",
      elapsed: 0,
      tokens: 0,
    });
    state.tasks.push({
      id: taskNode.id,
      label: goal,
      status: "active",
      agent: handle.id,
      children: [],
    });
    notifyStateChange();

    // Stream events from agent
    for await (const event of adapter.send(handle, goal)) {
      // Update state based on events
      const agentIdx = state.agents.findIndex((a) => a.id === handle.id);
      if (agentIdx >= 0) {
        if (event.type === "tool_use") {
          state.agents[agentIdx]!.currentAction = `${event.data.tool}`;
        }
        if (event.type === "progress" && event.data.text) {
          state.agents[agentIdx]!.currentAction = String(event.data.text).slice(0, 60);
        }
        if (event.type === "complete" && event.data.tokensOut) {
          state.agents[agentIdx]!.tokens += Number(event.data.tokensOut) + Number(event.data.tokensIn ?? 0);
          state.totalCost += Number(event.data.costUsd ?? 0);
        }
        state.agents[agentIdx]!.elapsed = Date.now() - state.startTime;
      }

      if (event.type === "reasoning") {
        state.reasoning.push({
          agentId: handle.id,
          timestamp: event.timestamp,
          content: String(event.data.content),
        });
      }

      notifyStateChange();
      yield event;
    }

    // Mark complete
    executor.complete(taskNode.id, true);
    const taskIdx = state.tasks.findIndex((t) => t.id === taskNode.id);
    if (taskIdx >= 0) state.tasks[taskIdx]!.status = "done";
    state.agents = state.agents.filter((a) => a.id !== handle.id);
    notifyStateChange();

    providers.logger.info("run complete", { goal, summary: executor.summary() });
  }

  providers.logger.info("orchestrator initialized", {
    rootDir,
    adapters: [...adapters.keys()],
  });

  return {
    config,
    providers,
    adapters,
    worktrees,
    state,
    run,
    onStateChange: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  };
}
