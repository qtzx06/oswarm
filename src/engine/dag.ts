import type { TaskDAG, TaskNode } from "../types/index.ts";

export class DAGExecutor {
  private running = new Set<string>();

  constructor(
    private dag: TaskDAG,
    private maxConcurrency: number
  ) {}

  getReady(): TaskNode[] {
    const available = this.dag.nodes.filter((node) => {
      if (node.status !== "pending") return false;

      const blockers = this.dag.edges.filter(
        (e) => e.to === node.id && e.type === "blocks"
      );
      return blockers.every((dep) => {
        const depNode = this.dag.nodes.find((n) => n.id === dep.from);
        return depNode?.status === "completed";
      });
    });

    const slots = this.maxConcurrency - this.running.size;
    return available.slice(0, Math.max(0, slots));
  }

  start(taskId: string): void {
    const node = this.dag.nodes.find((n) => n.id === taskId);
    if (!node) throw new Error(`Unknown task: ${taskId}`);
    node.status = "running";
    this.running.add(taskId);
  }

  complete(taskId: string, success: boolean): void {
    const node = this.dag.nodes.find((n) => n.id === taskId);
    if (!node) throw new Error(`Unknown task: ${taskId}`);

    node.status = success ? "completed" : "failed";
    this.running.delete(taskId);

    if (!success) {
      const downstream = this.getDownstream(taskId);
      for (const id of downstream) {
        const n = this.dag.nodes.find((x) => x.id === id);
        if (n && n.status === "pending") {
          n.status = "blocked";
        }
      }
    }
  }

  private getDownstream(taskId: string): string[] {
    const direct = this.dag.edges
      .filter((e) => e.from === taskId && e.type === "blocks")
      .map((e) => e.to);

    const all = new Set(direct);
    for (const id of direct) {
      for (const sub of this.getDownstream(id)) {
        all.add(sub);
      }
    }
    return [...all];
  }

  isComplete(): boolean {
    return this.dag.nodes.every(
      (n) => n.status === "completed" || n.status === "failed" || n.status === "blocked"
    );
  }

  summary(): { completed: number; failed: number; blocked: number; pending: number; running: number } {
    const counts = { completed: 0, failed: 0, blocked: 0, pending: 0, running: 0 };
    for (const node of this.dag.nodes) {
      counts[node.status]++;
    }
    return counts;
  }
}
