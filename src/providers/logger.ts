export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  ts: number;
  [key: string]: unknown;
}

export interface StructuredLogger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(component: string): StructuredLogger {
  function log(level: LogEntry["level"], msg: string, meta?: Record<string, unknown>) {
    const entry: LogEntry = { level, msg, ts: Date.now(), component, ...meta };
    const line = JSON.stringify(entry) + "\n";
    if (level === "error") {
      process.stderr.write(line);
    }
  }

  return {
    debug: (msg, meta) => log("debug", msg, meta),
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
  };
}
