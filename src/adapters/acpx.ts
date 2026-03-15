import type { AgentAdapter } from "./interface.ts";
import type {
  AgentHandle,
  AgentEvent,
  HealthStatus,
  SpawnManifest,
  AdapterType,
} from "../types/index.ts";
import type { Providers } from "../providers/index.ts";
import type { Subprocess } from "bun";

type AcpxAgent = "codex" | "openclaw" | "claude" | "gemini" | "copilot" | "kiro";

interface AcpxHandleState {
  proc: Subprocess | null;
  sessionName: string;
  agent: AcpxAgent;
  killed: boolean;
}

function adapterToAcpxAgent(adapter: AdapterType): AcpxAgent {
  switch (adapter) {
    case "codex": return "codex";
    case "openclaw": return "openclaw";
    case "cc": return "claude";
    default: return "codex";
  }
}

export function createAcpxAdapter(
  agentType: AcpxAgent,
  providers: Providers
): AgentAdapter {
  const { logger } = providers;
  const handles = new Map<string, AcpxHandleState>();

  return {
    type: agentType,

    async spawn(manifest: SpawnManifest): Promise<AgentHandle> {
      const sessionName = `oswarm-${crypto.randomUUID().slice(0, 8)}`;
      const handle: AgentHandle = {
        id: `${agentType}-${crypto.randomUUID().slice(0, 8)}`,
        adapter: manifest.task.adapter,
        taskId: manifest.task.id,
        worktree: manifest.worktreePath,
      };

      // Create a new acpx session
      const result = await Bun.$`bunx acpx ${agentType} sessions new --name ${sessionName}`.quiet();
      if (result.exitCode !== 0) {
        logger.warn("session create failed, proceeding anyway", {
          stderr: result.stderr.toString(),
        });
      }

      handles.set(handle.id, {
        proc: null,
        sessionName,
        agent: agentType,
        killed: false,
      });

      logger.info("acpx agent spawned", {
        agentId: handle.id,
        agent: agentType,
        session: sessionName,
        taskId: manifest.task.id,
      });
      return handle;
    },

    async *send(
      handle: AgentHandle,
      message: string
    ): AsyncGenerator<AgentEvent, void, unknown> {
      const state = handles.get(handle.id);
      if (!state) throw new Error(`Unknown agent: ${handle.id}`);
      if (state.killed) throw new Error(`Agent ${handle.id} was killed`);

      logger.info("sending to acpx agent", {
        agentId: handle.id,
        agent: state.agent,
        message: message.slice(0, 100),
      });

      const cwd = handle.worktree ?? process.cwd();

      try {
        // Run acpx with JSON output for structured parsing
        const proc = Bun.spawn(
          [
            "bunx", "acpx", state.agent,
            "--format", "json",
            "--approve-all",
            "--cwd", cwd,
            "-s", state.sessionName,
            message,
          ],
          {
            cwd,
            stdout: "pipe",
            stderr: "pipe",
          }
        );

        state.proc = proc;

        // Read NDJSON output line by line
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const parsed = JSON.parse(line);

              // Map ACP JSON-RPC messages to AgentEvents
              if (parsed.method === "session/update") {
                const update = parsed.params;
                if (update?.type === "agent_message_chunk") {
                  yield {
                    type: "progress",
                    agentId: handle.id,
                    taskId: handle.taskId,
                    timestamp: Date.now(),
                    data: { chunk: update },
                  };
                }
                if (update?.type === "tool_call_update") {
                  yield {
                    type: "tool_use",
                    agentId: handle.id,
                    taskId: handle.taskId,
                    timestamp: Date.now(),
                    data: {
                      tool: update.name ?? "unknown",
                      status: update.status,
                    },
                  };
                }
              }

              // Final result
              if (parsed.result && !parsed.method) {
                yield {
                  type: "complete",
                  agentId: handle.id,
                  taskId: handle.taskId,
                  timestamp: Date.now(),
                  data: { result: parsed.result },
                };
              }
            } catch {
              // Non-JSON line, emit as progress text
              yield {
                type: "progress",
                agentId: handle.id,
                taskId: handle.taskId,
                timestamp: Date.now(),
                data: { text: line },
              };
            }
          }
        }

        const exitCode = await proc.exited;
        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text();
          yield {
            type: "error",
            agentId: handle.id,
            taskId: handle.taskId,
            timestamp: Date.now(),
            data: { error: `acpx exited with code ${exitCode}: ${stderr}` },
          };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("acpx error", { agentId: handle.id, error: errorMsg });
        yield {
          type: "error",
          agentId: handle.id,
          taskId: handle.taskId,
          timestamp: Date.now(),
          data: { error: errorMsg },
        };
      } finally {
        state.proc = null;
      }
    },

    async kill(handle: AgentHandle): Promise<void> {
      const state = handles.get(handle.id);
      if (state) {
        state.killed = true;
        state.proc?.kill();
        // Close the acpx session
        await Bun.$`bunx acpx ${state.agent} sessions close ${state.sessionName}`.quiet();
        handles.delete(handle.id);
        logger.info("acpx agent killed", { agentId: handle.id });
      }
    },

    async health(handle: AgentHandle): Promise<HealthStatus> {
      const state = handles.get(handle.id);
      return {
        alive: !!state && !state.killed,
        lastHeartbeat: Date.now(),
      };
    },
  };
}
