import type {
  AgentHandle,
  AgentEvent,
  HealthStatus,
  SpawnManifest,
} from "../types/index.ts";

export interface AgentAdapter {
  readonly type: string;
  spawn(manifest: SpawnManifest): Promise<AgentHandle>;
  send(handle: AgentHandle, message: string): AsyncGenerator<AgentEvent, void, unknown>;
  kill(handle: AgentHandle): Promise<void>;
  health(handle: AgentHandle): Promise<HealthStatus>;
}
