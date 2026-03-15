import React from "react";
import { Box, Text } from "ink";
import type { ReasoningEntry } from "../types/index.ts";

function ReasoningBlock({ entry }: { entry: ReasoningEntry }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>
        {entry.agentId}:
      </Text>
      <Box paddingLeft={1}>
        <Text wrap="wrap" color="white">
          "{entry.content}"
        </Text>
      </Box>
    </Box>
  );
}

export function ReasoningStream({ entries }: { entries: ReasoningEntry[] }) {
  const recent = entries.slice(-10);

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
        REASONING
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {recent.map((entry, i) => (
          <ReasoningBlock key={`${entry.agentId}-${i}`} entry={entry} />
        ))}
      </Box>
    </Box>
  );
}
