import React from "react";
import { Box, Text } from "ink";
import type { FocusPane } from "./App.tsx";

interface BottomBarProps {
  agentCount: number;
  totalCost: number;
  elapsed: number;
  alertCount: number;
  focusPane: FocusPane;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m${String(sec).padStart(2, "0")}s`;
}

export function BottomBar({
  agentCount,
  totalCost,
  elapsed,
  alertCount,
  focusPane,
}: BottomBarProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text dimColor>
        [q]uit [tab]pane [j/k]nav [enter]select [a]lerts
      </Text>
      <Box gap={2}>
        <Text color="gray">{focusPane}</Text>
        <Text color="cyan">{agentCount} agents</Text>
        {alertCount > 0 && (
          <Text color="yellow">⚠ {alertCount}</Text>
        )}
        <Text color="yellow">${totalCost.toFixed(2)}</Text>
        <Text color="green">{formatElapsed(elapsed)}</Text>
      </Box>
    </Box>
  );
}
