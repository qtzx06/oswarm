// Simple typed event emitter for the observer pipeline.

type Listener<T> = (event: T) => void;

export class EventBus<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<Listener<any>>>();

  on<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  emit<K extends keyof EventMap>(type: K, event: EventMap[K]): void {
    this.listeners.get(type)?.forEach((fn) => fn(event));
  }
}

// The bus that the observer pipeline uses
import type { OswarmEvent } from "./events.ts";

export type ObserverEventMap = {
  event: OswarmEvent;
  error: Error;
};

export function createObserverBus() {
  return new EventBus<ObserverEventMap>();
}
