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
  const handles = new Map<string, { abortController: AbortController }>();

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

      // TODO: wire to @anthropic-ai/claude-agent-sdk query() once installed
      // for now, yield a placeholder complete event
      yield {
        type: "complete",
        agentId: handle.id,
        taskId: handle.taskId,
        timestamp: Date.now(),
        data: { stub: true },
      };
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
      return {
        alive: handles.has(handle.id),
        lastHeartbeat: Date.now(),
      };
    },
  };
}
