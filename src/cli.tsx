import React from "react";
import { render } from "ink";
import { App } from "./tui/App.tsx";
import type { SwarmState } from "./types/index.ts";

// Mock data — will be replaced with real orchestrator state
const MOCK_STATE: SwarmState = {
  startTime: Date.now() - 360_000, // 6 min ago
  totalCost: 0.47,
  tasks: [
    {
      id: "t1",
      label: "refactor auth module",
      status: "active",
      children: [
        {
          id: "t1.1",
          label: "analyze dependencies",
          status: "done",
          agent: "agent-1",
          children: [],
        },
        {
          id: "t1.2",
          label: "extract types",
          status: "active",
          agent: "agent-1",
          children: [],
        },
        {
          id: "t1.3",
          label: "write tests",
          status: "active",
          agent: "agent-2",
          children: [
            {
              id: "t1.3.1",
              label: "unit tests",
              status: "active",
              agent: "agent-2",
              children: [],
            },
            {
              id: "t1.3.2",
              label: "integration tests",
              status: "pending",
              children: [],
            },
          ],
        },
        {
          id: "t1.4",
          label: "split module",
          status: "active",
          agent: "agent-3",
          children: [],
        },
        {
          id: "t1.5",
          label: "update docs",
          status: "pending",
          children: [],
        },
      ],
    },
  ],
  agents: [
    {
      id: "agent-1",
      backend: "cc",
      worktree: "auth-types",
      currentAction: "reading src/auth/middleware.ts",
      elapsed: 134_000,
      tokens: 1247,
    },
    {
      id: "agent-2",
      backend: "codex",
      worktree: "auth-tests",
      currentAction: "running tests — auth.test.ts (14/27 passing)",
      elapsed: 241_000,
      tokens: 3891,
      alert: {
        type: "stuck",
        message: "Retried same test failure 4 times",
        retryCount: 4,
        tokensBurned: 820,
      },
    },
    {
      id: "agent-3",
      backend: "cc",
      worktree: "auth-split",
      currentAction: "writing src/auth/session.ts",
      elapsed: 89_000,
      tokens: 2104,
    },
  ],
  reasoning: [
    {
      agentId: "agent-1",
      timestamp: Date.now() - 30_000,
      content:
        "The auth module has 3 concerns tangled: session management, permissions, and token validation. Extracting types first so the split is cleaner.",
    },
    {
      agentId: "agent-2",
      timestamp: Date.now() - 15_000,
      content:
        "Test suite has 13 failures remaining, 8 are import path issues from the refactor. Need to wait for agent-1 to finish type extraction before these resolve.",
    },
    {
      agentId: "agent-3",
      timestamp: Date.now() - 5_000,
      content:
        "Chose to split session handling first because it has the fewest cross-module dependencies. Token validation depends on both session and permissions.",
    },
  ],
};

render(<App initialState={MOCK_STATE} />);
