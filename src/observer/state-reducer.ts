// Reduces an event stream into SwarmState for the TUI.

import type { OswarmEvent } from "./events.ts";
import type { SwarmState, Task, AgentInfo, ReasoningEntry, Alert } from "../types/index.ts";
import type { AgentBackend } from "../types/index.ts";

export function createInitialState(): SwarmState {
  return {
    tasks: [],
    agents: [],
    reasoning: [],
    totalCost: 0,
    startTime: Date.now(),
  };
}

export function reduceEvent(state: SwarmState, event: OswarmEvent): SwarmState {
  switch (event.type) {
    case "agent.spawned": {
      const agent: AgentInfo = {
        id: event.agentId,
        backend: event.backend as AgentBackend,
        worktree: event.worktree,
        currentAction: "starting...",
        elapsed: 0,
        tokens: 0,
      };
      return {
        ...state,
        agents: [...state.agents, agent],
      };
    }

    case "agent.stopped": {
      return {
        ...state,
        agents: state.agents.filter((a) => a.id !== event.agentId),
      };
    }

    case "task.created": {
      const newTask: Task = {
        id: event.taskId,
        label: event.label,
        status: "pending",
        children: [],
      };
      if (event.parentId) {
        return {
          ...state,
          tasks: insertChild(state.tasks, event.parentId, newTask),
        };
      }
      return {
        ...state,
        tasks: [...state.tasks, newTask],
      };
    }

    case "task.updated": {
      return {
        ...state,
        tasks: updateTask(state.tasks, event.taskId, {
          status: event.status,
          agent: event.agentId,
        }),
      };
    }

    case "agent.activity": {
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === event.agentId
            ? { ...a, currentAction: event.action, elapsed: event.ts - state.startTime }
            : a
        ),
      };
    }

    case "agent.reasoning": {
      const entry: ReasoningEntry = {
        agentId: event.agentId,
        timestamp: event.ts,
        content: event.content,
      };
      return {
        ...state,
        reasoning: [...state.reasoning.slice(-50), entry], // Keep last 50
      };
    }

    case "agent.tokens": {
      return {
        ...state,
        totalCost: state.totalCost + event.costUsd,
        agents: state.agents.map((a) =>
          a.id === event.agentId
            ? { ...a, tokens: a.tokens + event.inputTokens + event.outputTokens }
            : a
        ),
      };
    }

    case "alert": {
      const alert: Alert = {
        type: event.alertType,
        message: event.message,
        retryCount: event.retryCount,
        tokensBurned: event.tokensBurned,
      };
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === event.agentId ? { ...a, alert } : a
        ),
      };
    }

    default:
      return state;
  }
}

// Tree helpers

function insertChild(tasks: Task[], parentId: string, child: Task): Task[] {
  return tasks.map((t) => {
    if (t.id === parentId) {
      return { ...t, children: [...t.children, child] };
    }
    if (t.children.length > 0) {
      return { ...t, children: insertChild(t.children, parentId, child) };
    }
    return t;
  });
}

function updateTask(
  tasks: Task[],
  taskId: string,
  update: Partial<Pick<Task, "status" | "agent">>
): Task[] {
  return tasks.map((t) => {
    if (t.id === taskId) {
      return { ...t, ...update };
    }
    if (t.children.length > 0) {
      return { ...t, children: updateTask(t.children, taskId, update) };
    }
    return t;
  });
}
