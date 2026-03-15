import React from "react";
import { Box, Text } from "ink";
import { App } from "./App.tsx";
import { useObserver } from "./useObserver.ts";

interface LiveAppProps {
  projectDir: string;
}

export function LiveApp({ projectDir }: LiveAppProps) {
  const { state } = useObserver(projectDir);

  if (state.agents.length === 0 && state.tasks.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          oswarm watch
        </Text>
        <Text dimColor>
          Watching {projectDir}/.oswarm/events/ for agent activity...
        </Text>
        <Text dimColor>
          No agents running yet. Start a swarm with: oswarm run {"<goal>"}
        </Text>
        <Text dimColor>
          Or try demo mode: oswarm watch --demo
        </Text>
      </Box>
    );
  }

  return <App initialState={state} />;
}
