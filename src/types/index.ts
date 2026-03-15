export type TaskStatus = "pending" | "active" | "done" | "failed";

export interface Task {
  id: string;
  label: string;
  status: TaskStatus;
  agent?: string;
  children: Task[];
}

export type AgentBackend = "cc" | "codex" | "openclaw" | "modal" | "fly";

export interface AgentInfo {
  id: string;
  backend: AgentBackend;
  worktree?: string;
  currentAction: string;
  elapsed: number; // ms
  tokens: number;
  alert?: Alert;
}

export interface Alert {
  type: "stuck" | "spinning" | "conflict" | "stalled";
  message: string;
  retryCount?: number;
  tokensBurned?: number;
}

export interface ReasoningEntry {
  agentId: string;
  timestamp: number;
  content: string;
}

export interface SwarmState {
  tasks: Task[];
  agents: AgentInfo[];
  reasoning: ReasoningEntry[];
  totalCost: number;
  startTime: number;
}
