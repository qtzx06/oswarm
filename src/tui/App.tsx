import React, { useState, useEffect } from "react";
import { Box, useApp, useInput } from "ink";
import { TaskTree } from "./TaskTree.tsx";
import { AgentFeed } from "./AgentFeed.tsx";
import { ReasoningStream } from "./ReasoningStream.tsx";
import { BottomBar } from "./BottomBar.tsx";
import type { SwarmState } from "../types/index.ts";

interface AppProps {
  initialState: SwarmState;
}

export function App({ initialState }: AppProps) {
  const { exit } = useApp();
  const [state, setState] = useState(initialState);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - state.startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [state.startTime]);

  useInput((input) => {
    if (input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" flexGrow={1}>
        <TaskTree tasks={state.tasks} />
        <AgentFeed agents={state.agents} />
        <ReasoningStream entries={state.reasoning} />
      </Box>
      <BottomBar
        agentCount={state.agents.length}
        totalCost={state.totalCost}
        elapsed={elapsed}
      />
    </Box>
  );
}
