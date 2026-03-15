import React, { useState, useEffect, useCallback } from "react";
import { Box, useApp, useInput } from "ink";
import { TaskTree } from "./TaskTree.tsx";
import { AgentFeed } from "./AgentFeed.tsx";
import { ReasoningStream } from "./ReasoningStream.tsx";
import { BottomBar } from "./BottomBar.tsx";
import { AlertOverlay } from "./AlertOverlay.tsx";
import type { SwarmState, AgentInfo } from "../types/index.ts";

export type FocusPane = "tasks" | "agents" | "reasoning";

interface AppProps {
  initialState: SwarmState;
}

export function App({ initialState }: AppProps) {
  const { exit } = useApp();
  const [state, setState] = useState(initialState);
  const [elapsed, setElapsed] = useState(0);
  const [focusPane, setFocusPane] = useState<FocusPane>("agents");
  const [selectedTask, setSelectedTask] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState(0);
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const [alertAgent, setAlertAgent] = useState<AgentInfo | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - state.startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [state.startTime]);

  // Flatten visible tasks for navigation
  const flattenTasks = useCallback(
    (tasks: SwarmState["tasks"], depth = 0): { id: string; depth: number }[] => {
      const result: { id: string; depth: number }[] = [];
      for (const task of tasks) {
        result.push({ id: task.id, depth });
        if (!collapsedTasks.has(task.id)) {
          result.push(...flattenTasks(task.children, depth + 1));
        }
      }
      return result;
    },
    [collapsedTasks]
  );

  const visibleTasks = flattenTasks(state.tasks);
  const alertAgents = state.agents.filter((a) => a.alert);

  useInput((input, key) => {
    // Quit
    if (input === "q") {
      exit();
      return;
    }

    // Alert overlay active — handle alert actions
    if (alertAgent) {
      if (input === "k" || input === "r" || input === "h" || input === "i") {
        // TODO: dispatch action to orchestrator
        setAlertAgent(null);
      }
      if (key.escape) {
        setAlertAgent(null);
      }
      return;
    }

    // Switch panes with tab / shift+tab
    if (key.tab) {
      const panes: FocusPane[] = ["tasks", "agents", "reasoning"];
      const idx = panes.indexOf(focusPane);
      if (key.shift) {
        setFocusPane(panes[(idx - 1 + panes.length) % panes.length]!);
      } else {
        setFocusPane(panes[(idx + 1) % panes.length]!);
      }
      return;
    }

    // Navigate within focused pane
    if (input === "j" || key.downArrow) {
      if (focusPane === "tasks") {
        setSelectedTask((prev) => Math.min(prev + 1, visibleTasks.length - 1));
      } else if (focusPane === "agents") {
        setSelectedAgent((prev) =>
          Math.min(prev + 1, state.agents.length - 1)
        );
      }
      return;
    }

    if (input === "k" || key.upArrow) {
      if (focusPane === "tasks") {
        setSelectedTask((prev) => Math.max(prev - 1, 0));
      } else if (focusPane === "agents") {
        setSelectedAgent((prev) => Math.max(prev - 1, 0));
      }
      return;
    }

    // Expand/collapse in task tree
    if (key.return && focusPane === "tasks") {
      const taskEntry = visibleTasks[selectedTask];
      if (taskEntry) {
        setCollapsedTasks((prev) => {
          const next = new Set(prev);
          if (next.has(taskEntry.id)) {
            next.delete(taskEntry.id);
          } else {
            next.add(taskEntry.id);
          }
          return next;
        });
      }
      return;
    }

    // Open alert action picker for selected agent
    if (key.return && focusPane === "agents") {
      const agent = state.agents[selectedAgent];
      if (agent?.alert) {
        setAlertAgent(agent);
      }
      return;
    }

    // Quick-jump to next alert
    if (input === "a") {
      if (alertAgents.length > 0) {
        setFocusPane("agents");
        const idx = state.agents.findIndex((a) => a.alert);
        if (idx >= 0) setSelectedAgent(idx);
      }
      return;
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" flexGrow={1}>
        <TaskTree
          tasks={state.tasks}
          selectedIndex={selectedTask}
          collapsedIds={collapsedTasks}
          focused={focusPane === "tasks"}
        />
        <AgentFeed
          agents={state.agents}
          selectedIndex={selectedAgent}
          focused={focusPane === "agents"}
        />
        <ReasoningStream
          entries={state.reasoning}
          focused={focusPane === "reasoning"}
        />
      </Box>
      {alertAgent && <AlertOverlay agent={alertAgent} />}
      <BottomBar
        agentCount={state.agents.length}
        totalCost={state.totalCost}
        elapsed={elapsed}
        alertCount={alertAgents.length}
        focusPane={focusPane}
      />
    </Box>
  );
}
