// Observer pipeline: tails event files, detects alerts, reduces to SwarmState.

import { join } from "node:path";
import { createObserverBus } from "./event-bus.ts";
import { FileTailer } from "./file-tailer.ts";
import { AlertDetector } from "./alert-detector.ts";
import { createInitialState, reduceEvent } from "./state-reducer.ts";
import type { SwarmState } from "../types/index.ts";

export interface Observer {
  getState(): SwarmState;
  subscribe(fn: (state: SwarmState) => void): () => void;
  start(): Promise<void>;
  stop(): void;
}

export function createObserver(projectDir: string): Observer {
  const eventsDir = join(projectDir, ".oswarm", "events");
  const sessionId = `watch-${Date.now()}`;
  const bus = createObserverBus();
  const tailer = new FileTailer(eventsDir, bus);
  const detector = new AlertDetector(bus, sessionId);
  let state = createInitialState();
  const subscribers = new Set<(state: SwarmState) => void>();

  bus.on("event", (event) => {
    state = reduceEvent(state, event);
    for (const fn of subscribers) {
      fn(state);
    }
  });

  return {
    getState: () => state,

    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    async start() {
      detector.start();
      await tailer.start();
    },

    stop() {
      detector.stop();
      tailer.stop();
    },
  };
}

export { createInitialState, reduceEvent } from "./state-reducer.ts";
export type { OswarmEvent } from "./events.ts";
