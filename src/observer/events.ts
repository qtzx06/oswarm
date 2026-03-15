// Event types emitted by agents and consumed by the observer.
// Written as NDJSON to .oswarm/events/<session-id>.ndjson

export type OswarmEvent =
  | AgentSpawnedEvent
  | AgentStoppedEvent
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | AgentActivityEvent
  | ReasoningEvent
  | TokenUsageEvent
  | AlertEvent;

interface BaseEvent {
  ts: number; // unix ms
  sessionId: string;
}

export interface AgentSpawnedEvent extends BaseEvent {
  type: "agent.spawned";
  agentId: string;
  backend: string;
  worktree?: string;
}

export interface AgentStoppedEvent extends BaseEvent {
  type: "agent.stopped";
  agentId: string;
  reason: "completed" | "killed" | "error";
  error?: string;
}

export interface TaskCreatedEvent extends BaseEvent {
  type: "task.created";
  taskId: string;
  parentId?: string;
  label: string;
}

export interface TaskUpdatedEvent extends BaseEvent {
  type: "task.updated";
  taskId: string;
  status: "pending" | "active" | "done" | "failed";
  agentId?: string;
}

export interface AgentActivityEvent extends BaseEvent {
  type: "agent.activity";
  agentId: string;
  action: string; // e.g. "reading src/auth.ts", "running tests"
}

export interface ReasoningEvent extends BaseEvent {
  type: "agent.reasoning";
  agentId: string;
  content: string;
}

export interface TokenUsageEvent extends BaseEvent {
  type: "agent.tokens";
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AlertEvent extends BaseEvent {
  type: "alert";
  agentId: string;
  alertType: "stuck" | "spinning" | "conflict" | "stalled";
  message: string;
  retryCount?: number;
  tokensBurned?: number;
}

export function parseEvent(line: string): OswarmEvent | null {
  try {
    return JSON.parse(line) as OswarmEvent;
  } catch {
    return null;
  }
}
