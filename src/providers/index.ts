import { createLogger, type StructuredLogger } from "./logger.ts";
import { createKeyVault, type KeyVault } from "./keys.ts";
export type { StructuredLogger } from "./logger.ts";
export type { KeyVault } from "./keys.ts";

export interface Providers {
  logger: StructuredLogger;
  keys: KeyVault;
}

export function createProviders(component: string): Providers {
  return {
    logger: createLogger(component),
    keys: createKeyVault(),
  };
}
