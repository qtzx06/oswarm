import React from "react";
import { Box, Text } from "ink";

interface BottomBarProps {
  agentCount: number;
  totalCost: number;
  elapsed: number;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m${String(sec).padStart(2, "0")}s`;
}

export function BottomBar({ agentCount, totalCost, elapsed }: BottomBarProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text dimColor>
        [q]uit [k/j]nav [enter]expand [?]help
      </Text>
      <Box gap={2}>
        <Text color="cyan">{agentCount} agents</Text>
        <Text color="yellow">${totalCost.toFixed(2)}</Text>
        <Text color="green">{formatElapsed(elapsed)}</Text>
      </Box>
    </Box>
  );
}
