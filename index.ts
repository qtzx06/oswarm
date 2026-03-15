// types
export type {
  Task,
  TaskStatus,
  AgentBackend,
  AgentInfo,
  Alert,
  ReasoningEntry,
  SwarmState,
  AdapterType,
  ModelHint,
  TaskNode,
  TaskDAG,
  AgentEvent,
  AgentHandle,
  SpawnManifest,
  TasteSpec,
} from "./src/types/index.ts";

// orchestrator
export { createOrchestrator, type Orchestrator } from "./src/orchestrator.ts";

// adapters
export { createCCAdapter } from "./src/adapters/cc.ts";
export { createAcpxAdapter } from "./src/adapters/acpx.ts";
export type { AgentAdapter } from "./src/adapters/interface.ts";

// engine
export { DAGExecutor } from "./src/engine/dag.ts";
export { WorktreeManager } from "./src/engine/worktree.ts";

// config
export { loadConfig, DEFAULT_CONFIG } from "./src/config/index.ts";
export type { OswarmConfig } from "./src/config/schema.ts";

// providers
export { createProviders } from "./src/providers/index.ts";
export type { Providers } from "./src/providers/index.ts";
