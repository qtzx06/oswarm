// Tails NDJSON files in .oswarm/events/ for new events.
// Uses Bun.file + fs.watch for efficient watching.

import { watch, type FSWatcher } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseEvent, type OswarmEvent } from "./events.ts";
import type { EventBus, ObserverEventMap } from "./event-bus.ts";

interface FileState {
  offset: number; // bytes already read
}

export class FileTailer {
  private dir: string;
  private bus: EventBus<ObserverEventMap>;
  private watcher: FSWatcher | null = null;
  private files = new Map<string, FileState>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(dir: string, bus: EventBus<ObserverEventMap>) {
    this.dir = dir;
    this.bus = bus;
  }

  async start(): Promise<void> {
    // Ensure directory exists
    await Bun.write(join(this.dir, ".keep"), "");

    // Initial scan
    await this.scanDir();

    // Watch for new files and changes
    try {
      this.watcher = watch(this.dir, (eventType, filename) => {
        if (filename?.endsWith(".ndjson")) {
          this.tailFile(join(this.dir, filename));
        }
      });
    } catch {
      // Fallback to polling if fs.watch not available
    }

    // Poll every 500ms as backup (fs.watch can miss events)
    this.pollInterval = setInterval(() => this.scanDir(), 500);
  }

  stop(): void {
    this.watcher?.close();
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private async scanDir(): Promise<void> {
    try {
      const entries = await readdir(this.dir);
      for (const entry of entries) {
        if (entry.endsWith(".ndjson")) {
          await this.tailFile(join(this.dir, entry));
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  private async tailFile(path: string): Promise<void> {
    const state = this.files.get(path) ?? { offset: 0 };

    try {
      const file = Bun.file(path);
      const size = file.size;

      if (size <= state.offset) return; // No new data

      const blob = file.slice(state.offset, size);
      const text = await blob.text();
      state.offset = size;
      this.files.set(path, state);

      const lines = text.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        const event = parseEvent(line);
        if (event) {
          this.bus.emit("event", event);
        }
      }
    } catch (err) {
      this.bus.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }
}
