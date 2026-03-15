import { test, expect } from "bun:test";
import { DAGExecutor } from "../src/engine/dag.ts";
import type { TaskDAG, TaskNode } from "../src/types/index.ts";

function makeNode(id: string): TaskNode {
  return {
    id,
    goal: `task ${id}`,
    isolation: "shared",
    adapter: "cc",
    model: "sonnet",
    contextRequirements: [],
    exitCriteria: { tests_pass: false, linter_clean: false, review_required: false },
    estimatedComplexity: "trivial",
    status: "pending",
  };
}

test("executes independent tasks in parallel", () => {
  const dag: TaskDAG = {
    nodes: [makeNode("a"), makeNode("b"), makeNode("c")],
    edges: [],
  };

  const executor = new DAGExecutor(dag, 3);
  const ready = executor.getReady();
  expect(ready.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
});

test("respects dependencies", () => {
  const dag: TaskDAG = {
    nodes: [makeNode("a"), makeNode("b"), makeNode("c")],
    edges: [
      { from: "a", to: "b", type: "blocks" },
      { from: "b", to: "c", type: "blocks" },
    ],
  };

  const executor = new DAGExecutor(dag, 3);
  const ready = executor.getReady();
  expect(ready.map((n) => n.id)).toEqual(["a"]);

  executor.complete("a", true);
  const next = executor.getReady();
  expect(next.map((n) => n.id)).toEqual(["b"]);
});

test("marks downstream as blocked on failure", () => {
  const dag: TaskDAG = {
    nodes: [makeNode("a"), makeNode("b"), makeNode("c")],
    edges: [
      { from: "a", to: "b", type: "blocks" },
    ],
  };

  const executor = new DAGExecutor(dag, 3);
  executor.complete("a", false);

  const ready = executor.getReady();
  expect(ready.map((n) => n.id)).toEqual(["c"]);

  const bNode = dag.nodes.find((n) => n.id === "b")!;
  expect(bNode.status).toBe("blocked");
});

test("respects concurrency limit", () => {
  const dag: TaskDAG = {
    nodes: [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")],
    edges: [],
  };

  const executor = new DAGExecutor(dag, 2);
  const ready = executor.getReady();
  expect(ready.length).toBe(2);
});

test("isComplete returns true when all nodes resolved", () => {
  const dag: TaskDAG = {
    nodes: [makeNode("a"), makeNode("b")],
    edges: [{ from: "a", to: "b", type: "blocks" }],
  };

  const executor = new DAGExecutor(dag, 2);
  expect(executor.isComplete()).toBe(false);

  executor.complete("a", false); // a fails, b blocked
  expect(executor.isComplete()).toBe(true);
});
