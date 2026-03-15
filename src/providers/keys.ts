import type { AgentHandle } from "../types/index.ts";

export interface KeyVault {
  get(key: string, agent?: AgentHandle): string | undefined;
  scope(keys: string[]): Record<string, string>;
  audit(): Array<{ key: string; agentId: string; timestamp: number }>;
}

export function createKeyVault(): KeyVault {
  const accessLog: Array<{ key: string; agentId: string; timestamp: number }> = [];

  return {
    get(key: string, agent?: AgentHandle): string | undefined {
      const value = process.env[key];
      if (value && agent) {
        accessLog.push({ key, agentId: agent.id, timestamp: Date.now() });
      }
      return value;
    },

    scope(keys: string[]): Record<string, string> {
      const result: Record<string, string> = {};
      for (const key of keys) {
        const val = process.env[key];
        if (val) result[key] = val;
      }
      return result;
    },

    audit() {
      return [...accessLog];
    },
  };
}
