import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentAdapter } from "./interface.ts";
import type {
  AgentHandle,
  AgentEvent,
  HealthStatus,
  SpawnManifest,
} from "../types/index.ts";
import type { Providers } from "../providers/index.ts";

interface CCHandleState {
  abortController: AbortController;
  queryHandle: ReturnType<typeof query> | null;
}

export function createCCAdapter(providers: Providers): AgentAdapter {
  const { logger } = providers;
  const handles = new Map<string, CCHandleState>();

  return {
    type: "cc",

    async spawn(manifest: SpawnManifest): Promise<AgentHandle> {
      const handle: AgentHandle = {
        id: `cc-${crypto.randomUUID().slice(0, 8)}`,
        adapter: "cc",
        taskId: manifest.task.id,
        worktree: manifest.worktreePath,
      };

      handles.set(handle.id, {
        abortController: new AbortController(),
        queryHandle: null,
      });
      logger.info("agent spawned", { agentId: handle.id, taskId: manifest.task.id });
      return handle;
    },

    async *send(
      handle: AgentHandle,
      message: string
    ): AsyncGenerator<AgentEvent, void, unknown> {
      const state = handles.get(handle.id);
      if (!state) throw new Error(`Unknown agent: ${handle.id}`);

      logger.info("sending to agent", {
        agentId: handle.id,
        message: message.slice(0, 100),
      });

      const q = query({
        prompt: message,
        options: {
          cwd: handle.worktree ?? process.cwd(),
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          abortController: state.abortController,
          tools: { type: "preset", preset: "claude_code" },
          systemPrompt: { type: "preset", preset: "claude_code" },
          maxTurns: 50,
        },
      });

      state.queryHandle = q;

      try {
        for await (const msg of q) {
          // Extract reasoning from assistant thinking
          if (msg.type === "assistant" && "message" in msg) {
            const content = (msg as any).message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === "thinking" && block.thinking) {
                  yield {
                    type: "reasoning",
                    agentId: handle.id,
                    taskId: handle.taskId,
                    timestamp: Date.now(),
                    data: { content: block.thinking },
                  };
                }
                if (block.type === "text" && block.text) {
                  yield {
                    type: "progress",
                    agentId: handle.id,
                    taskId: handle.taskId,
                    timestamp: Date.now(),
                    data: { text: block.text },
                  };
                }
              }
            }
          }

          // Tool use events
          if (msg.type === "assistant" && "message" in msg) {
            const content = (msg as any).message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === "tool_use") {
                  yield {
                    type: "tool_use",
                    agentId: handle.id,
                    taskId: handle.taskId,
                    timestamp: Date.now(),
                    data: {
                      tool: block.name,
                      input: block.input,
                    },
                  };
                }
              }
            }
          }

          // Result message
          if (msg.type === "result") {
            yield {
              type: "complete",
              agentId: handle.id,
              taskId: handle.taskId,
              timestamp: Date.now(),
              data: {
                result: (msg as any).result,
                costUsd: (msg as any).costUsd,
                duration: (msg as any).duration,
                tokensIn: (msg as any).inputTokens,
                tokensOut: (msg as any).outputTokens,
              },
            };
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("agent error", { agentId: handle.id, error: errorMsg });
        yield {
          type: "error",
          agentId: handle.id,
          taskId: handle.taskId,
          timestamp: Date.now(),
          data: { error: errorMsg },
        };
      }
    },

    async kill(handle: AgentHandle): Promise<void> {
      const state = handles.get(handle.id);
      if (state) {
        state.abortController.abort();
        state.queryHandle?.close();
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
