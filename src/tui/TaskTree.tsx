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

interface FlatTask {
  task: Task;
  depth: number;
  isLast: boolean;
}

function flattenTasks(
  tasks: Task[],
  depth: number,
  collapsedIds: Set<string>
): FlatTask[] {
  const result: FlatTask[] = [];
  tasks.forEach((task, i) => {
    result.push({ task, depth, isLast: i === tasks.length - 1 });
    if (!collapsedIds.has(task.id) && task.children.length > 0) {
      result.push(...flattenTasks(task.children, depth + 1, collapsedIds));
    }
  });
  return result;
}

function TaskRow({
  task,
  depth,
  selected,
  collapsed,
}: {
  task: Task;
  depth: number;
  selected: boolean;
  collapsed: boolean;
}) {
  const icon = STATUS_ICON[task.status];
  const color = STATUS_COLOR[task.status];
  const indent = depth > 0 ? "  ".repeat(depth - 1) + "├─" : "";
  const expandIcon =
    task.children.length > 0 ? (collapsed ? "▸ " : "▾ ") : "  ";

  return (
    <Box>
      <Text
        backgroundColor={selected ? "gray" : undefined}
        dimColor={task.status === "pending"}
      >
        {indent}
        <Text color={color}>{icon}</Text> {expandIcon}
        {task.label}
        {task.agent && task.status === "active" && (
          <Text color="gray"> [{task.agent}]</Text>
        )}
      </Text>
    </Box>
  );
}

interface TaskTreeProps {
  tasks: Task[];
  selectedIndex: number;
  collapsedIds: Set<string>;
  focused: boolean;
}

export function TaskTree({
  tasks,
  selectedIndex,
  collapsedIds,
  focused,
}: TaskTreeProps) {
  const flat = flattenTasks(tasks, 0, collapsedIds);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? "cyan" : "gray"}
      paddingX={1}
      flexBasis="30%"
      flexShrink={0}
    >
      <Text bold color={focused ? "cyan" : "white"}>
        TASKS
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {flat.map(({ task, depth }, i) => (
          <TaskRow
            key={task.id}
            task={task}
            depth={depth}
            selected={focused && i === selectedIndex}
            collapsed={collapsedIds.has(task.id)}
          />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>✓ done ● active ○ pending ✕ failed</Text>
      </Box>
    </Box>
  );
}
