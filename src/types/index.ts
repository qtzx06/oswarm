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

// === Engine types ===

export type AdapterType = "cc" | "codex" | "openclaw" | "e2b" | "fly" | "modal";
export type ModelHint = "opus" | "sonnet" | "haiku" | "codex" | "any";
export type IsolationMode = "worktree" | "shared";
export type TaskComplexity = "trivial" | "moderate" | "complex";

export interface ExitCriteria {
  tests_pass: boolean;
  linter_clean: boolean;
  review_required: boolean;
  custom?: string;
}

export interface TaskNode {
  id: string;
  goal: string;
  isolation: IsolationMode;
  adapter: AdapterType;
  model: ModelHint;
  contextRequirements: string[];
  exitCriteria: ExitCriteria;
  estimatedComplexity: TaskComplexity;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  result?: TaskResult;
}

export interface TaskResult {
  success: boolean;
  artifacts: string[];
  error?: string;
  durationMs: number;
  tokensUsed: number;
}

export interface Dependency {
  from: string;
  to: string;
  type: "blocks" | "informs";
}

export interface TaskDAG {
  nodes: TaskNode[];
  edges: Dependency[];
}

export interface AgentEvent {
  type: "progress" | "tool_use" | "reasoning" | "error" | "complete";
  agentId: string;
  taskId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface AgentHandle {
  id: string;
  adapter: AdapterType;
  pid?: number;
  worktree?: string;
  taskId: string;
}

export interface HealthStatus {
  alive: boolean;
  lastHeartbeat: number;
  memoryMb?: number;
}

export interface SpawnManifest {
  task: TaskNode;
  contextInjection: string;
  worktreePath?: string;
  apiKeys: Record<string, string>;
  permissions: "full" | "read-only";
  tasteSpec?: TasteSpec;
}

export interface TasteSpec {
  architecture?: {
    layer?: string;
    domain?: string;
    allowed_dependencies?: string[];
  };
  patterns?: Record<string, boolean | number>;
  style?: {
    prefer?: string;
    avoid?: string;
  };
  review?: {
    ralph_loop: boolean;
    min_reviewers?: number;
    exit_criteria?: string;
  };
}
