import React from "react";
import { Box, Text } from "ink";
import type { Task, TaskStatus } from "../types/index.ts";

const STATUS_ICON: Record<TaskStatus, string> = {
  active: "●",
  done: "✓",
  pending: "○",
  failed: "✕",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  active: "cyan",
  done: "green",
  pending: "gray",
  failed: "red",
};

function TaskNode({ task, depth }: { task: Task; depth: number }) {
  const icon = STATUS_ICON[task.status];
  const color = STATUS_COLOR[task.status];
  const prefix = depth === 0 ? "" : "  ".repeat(depth - 1) + "├─";

  return (
    <>
      <Box>
        <Text dimColor={task.status === "pending"}>
          {prefix}
          <Text color={color}>{icon}</Text> {task.label}
          {task.agent && task.status === "active" && (
            <Text color="gray"> [{task.agent}]</Text>
          )}
        </Text>
      </Box>
      {task.children.map((child) => (
        <TaskNode key={child.id} task={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function TaskTree({ tasks }: { tasks: Task[] }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexBasis="30%"
      flexShrink={0}
    >
      <Text bold color="white">
        TASKS
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {tasks.map((task) => (
          <TaskNode key={task.id} task={task} depth={0} />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          ✓ done ● active ○ pending ✕ failed
        </Text>
      </Box>
    </Box>
  );
}
