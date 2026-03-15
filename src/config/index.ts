import { DEFAULT_CONFIG } from "./defaults.ts";
import type { OswarmConfig } from "./schema.ts";
export type { OswarmConfig } from "./schema.ts";

export async function loadConfig(rootDir: string): Promise<OswarmConfig> {
  const configPath = `${rootDir}/.oswarm/config.json`;
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = await file.json();
  return { ...DEFAULT_CONFIG, ...raw };
}

export { DEFAULT_CONFIG };
