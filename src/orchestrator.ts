import { createProviders, type Providers } from "./providers/index.ts";
import { createCCAdapter, type AgentAdapter } from "./adapters/index.ts";
import { loadConfig, type OswarmConfig } from "./config/index.ts";
import { DAGExecutor } from "./engine/index.ts";
import type { AgentEvent, SwarmState, TaskDAG } from "./types/index.ts";

export interface Orchestrator {
  config: OswarmConfig;
  providers: Providers;
  adapter: AgentAdapter;
  state: SwarmState;
  onStateChange: (listener: (state: SwarmState) => void) => () => void;
}

export async function createOrchestrator(rootDir: string): Promise<Orchestrator> {
  const config = await loadConfig(rootDir);
  const providers = createProviders("orchestrator");
  const adapter = createCCAdapter(providers);

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

  providers.logger.info("orchestrator initialized", { rootDir });

  return {
    config,
    providers,
    adapter,
    state,
    onStateChange: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  };
}
