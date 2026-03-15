export interface OswarmConfig {
  schema_version: string;

  concurrency: {
    maxAgents: number;
    maxWorktrees: number;
    memoryBudgetMb: number;
  };

  adapters: {
    cc: { enabled: boolean; model: string };
    codex: { enabled: boolean };
    openclaw: { enabled: boolean };
    e2b: { enabled: boolean; apiKey?: string };
    fly: { enabled: boolean; apiKey?: string };
    modal: { enabled: boolean };
  };

  ralph_loop: {
    maxIterations: number;
    defaultReviewerCount: number;
  };

  paths: {
    oswarmDir: string;
    worktreeDir: string;
    docsDir: string;
  };

  autonomy: {
    fullAutonomy: boolean;
    autoSpawn: boolean;
  };
}
