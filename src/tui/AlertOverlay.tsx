import React from "react";
import { Box, Text } from "ink";
import type { AgentInfo } from "../types/index.ts";

interface AlertOverlayProps {
  agent: AgentInfo;
}

export function AlertOverlay({ agent }: AlertOverlayProps) {
  if (!agent.alert) return null;

  const { alert } = agent;

  return (
    <Box
      borderStyle="double"
      borderColor="yellow"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      marginX={4}
    >
      <Text color="yellow" bold>
        ⚠ ALERT — {agent.id} ({agent.backend})
      </Text>
      <Box marginTop={1}>
        <Text>
          <Text bold>{alert.type.toUpperCase()}</Text> — {alert.message}
        </Text>
      </Box>
      {alert.retryCount && (
        <Text dimColor>Retries: {alert.retryCount}</Text>
      )}
      {alert.tokensBurned && (
        <Text dimColor>Tokens burned: {alert.tokensBurned}</Text>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text color="red">
          [K] Kill agent
        </Text>
        <Text color="yellow">
          [R] Reassign task to new agent
        </Text>
        <Text color="cyan">
          [H] Provide hint (add context)
        </Text>
        <Text color="gray">
          [I] Ignore · [Esc] Close
        </Text>
      </Box>
    </Box>
  );
}
