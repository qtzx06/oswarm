import React from "react";
import { Box, Text } from "ink";
import type { AgentInfo } from "../types/index.ts";

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m${String(sec).padStart(2, "0")}s` : `${sec}s`;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const BACKEND_COLOR: Record<string, string> = {
  cc: "magenta",
  codex: "blue",
  openclaw: "yellow",
  modal: "cyan",
  fly: "green",
};

function AgentRow({ agent }: { agent: AgentInfo }) {
  const color = BACKEND_COLOR[agent.backend] ?? "white";
  const hasAlert = !!agent.alert;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          [{agent.id}]
        </Text>
        <Text color="gray"> {agent.backend}</Text>
        {agent.worktree && <Text color="gray"> wt:{agent.worktree}</Text>}
      </Box>
      <Box paddingLeft={2}>
        <Text>→ {agent.currentAction}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text dimColor>
          {formatElapsed(agent.elapsed)} · {formatTokens(agent.tokens)} tokens
        </Text>
      </Box>
      {hasAlert && (
        <Box paddingLeft={2} marginTop={0}>
          <Text color="yellow" bold>
            ⚠ {agent.alert!.type.toUpperCase()}
          </Text>
          <Text color="yellow"> — {agent.alert!.message}</Text>
        </Box>
      )}
    </Box>
  );
}

export function AgentFeed({ agents }: { agents: AgentInfo[] }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexGrow={1}
    >
      <Text bold color="white">
        AGENTS
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} />
        ))}
      </Box>
    </Box>
  );
}
