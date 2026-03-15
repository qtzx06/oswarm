import type { OswarmConfig } from "./schema.ts";

export const DEFAULT_CONFIG: OswarmConfig = {
  schema_version: "1.0",
  concurrency: {
    maxAgents: 8,
    maxWorktrees: 12,
    memoryBudgetMb: 4096,
  },
  adapters: {
    cc: { enabled: true, model: "sonnet" },
    codex: { enabled: false },
    openclaw: { enabled: false },
    e2b: { enabled: false },
    fly: { enabled: false },
    modal: { enabled: false },
  },
  ralph_loop: {
    maxIterations: 5,
    defaultReviewerCount: 2,
  },
  paths: {
    oswarmDir: ".oswarm",
    worktreeDir: ".worktrees",
    docsDir: "docs",
  },
  autonomy: {
    fullAutonomy: true,
    autoSpawn: true,
  },
};
