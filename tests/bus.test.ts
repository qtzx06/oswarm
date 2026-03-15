import { test, expect } from "bun:test";
import { EventBus, createObserverBus } from "../src/observer/event-bus.ts";

test("typed event bus emits and receives", () => {
  const bus = new EventBus<{ ping: string; pong: number }>();
  const received: string[] = [];

  bus.on("ping", (val) => received.push(val));
  bus.emit("ping", "hello");
  bus.emit("ping", "world");

  expect(received).toEqual(["hello", "world"]);
});

test("unsubscribe works", () => {
  const bus = new EventBus<{ evt: number }>();
  const received: number[] = [];

  const unsub = bus.on("evt", (val) => received.push(val));
  bus.emit("evt", 1);
  unsub();
  bus.emit("evt", 2);

  expect(received).toEqual([1]);
});

test("observer bus works with OswarmEvent", () => {
  const bus = createObserverBus();
  const received: string[] = [];

  bus.on("event", (evt) => received.push(evt.type));
  bus.emit("event", {
    type: "agent.spawned",
    ts: Date.now(),
    sessionId: "test",
    agentId: "a1",
    backend: "cc",
  });

  expect(received).toEqual(["agent.spawned"]);
});
