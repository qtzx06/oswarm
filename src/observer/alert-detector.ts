// Heuristic alert detection. Watches agent activity patterns
// and emits alerts when something looks wrong.

import type { OswarmEvent, AlertEvent } from "./events.ts";
import type { EventBus, ObserverEventMap } from "./event-bus.ts";

interface AgentTracker {
  lastActions: string[];
  lastActivityTs: number;
  tokensSinceWrite: number;
  activeFiles: Set<string>;
}

export class AlertDetector {
  private trackers = new Map<string, AgentTracker>();
  private bus: EventBus<ObserverEventMap>;
  private sessionId: string;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  // Thresholds
  private readonly REPEAT_THRESHOLD = 4; // Same action N times = stuck
  private readonly IDLE_THRESHOLD_MS = 60_000; // No activity for 60s = stalled
  private readonly SPIN_TOKEN_THRESHOLD = 2000; // Tokens without file writes = spinning

  constructor(bus: EventBus<ObserverEventMap>, sessionId: string) {
    this.bus = bus;
    this.sessionId = sessionId;
  }

  start(): void {
    this.bus.on("event", (event) => this.processEvent(event));

    // Periodic check for stalled agents
    this.checkInterval = setInterval(() => this.checkStalled(), 10_000);
  }

  stop(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
  }

  private getTracker(agentId: string): AgentTracker {
    if (!this.trackers.has(agentId)) {
      this.trackers.set(agentId, {
        lastActions: [],
        lastActivityTs: Date.now(),
        tokensSinceWrite: 0,
        activeFiles: new Set(),
      });
    }
    return this.trackers.get(agentId)!;
  }

  private processEvent(event: OswarmEvent): void {
    if (event.type === "agent.activity") {
      const tracker = this.getTracker(event.agentId);
      tracker.lastActivityTs = event.ts;
      tracker.lastActions.push(event.action);
      if (tracker.lastActions.length > 10) tracker.lastActions.shift();

      // Check for file writes (resets spin counter)
      if (event.action.startsWith("writing ")) {
        tracker.tokensSinceWrite = 0;
        const file = event.action.replace("writing ", "");
        tracker.activeFiles.add(file);
      }

      // Check for stuck loop
      this.checkStuckLoop(event.agentId, tracker);

      // Check for file conflicts
      this.checkConflicts(event.agentId, event.action);
    }

    if (event.type === "agent.tokens") {
      const tracker = this.getTracker(event.agentId);
      tracker.tokensSinceWrite += event.inputTokens + event.outputTokens;

      // Check for spinning
      if (tracker.tokensSinceWrite > this.SPIN_TOKEN_THRESHOLD) {
        this.emitAlert(event.agentId, "spinning",
          `${tracker.tokensSinceWrite} tokens consumed with no file writes`,
          undefined,
          tracker.tokensSinceWrite
        );
      }
    }

    if (event.type === "agent.stopped") {
      this.trackers.delete(event.agentId);
    }
  }

  private checkStuckLoop(agentId: string, tracker: AgentTracker): void {
    if (tracker.lastActions.length < this.REPEAT_THRESHOLD) return;

    const recent = tracker.lastActions.slice(-this.REPEAT_THRESHOLD);
    const allSame = recent.every((a) => a === recent[0]);
    if (allSame) {
      this.emitAlert(
        agentId,
        "stuck",
        `Repeated "${recent[0]}" ${this.REPEAT_THRESHOLD} times`,
        this.REPEAT_THRESHOLD
      );
    }
  }

  private checkConflicts(agentId: string, action: string): void {
    if (!action.startsWith("writing ")) return;
    const file = action.replace("writing ", "");

    for (const [otherId, tracker] of this.trackers) {
      if (otherId === agentId) continue;
      if (tracker.activeFiles.has(file)) {
        this.emitAlert(
          agentId,
          "conflict",
          `Both ${agentId} and ${otherId} writing to ${file}`
        );
      }
    }
  }

  private checkStalled(): void {
    const now = Date.now();
    for (const [agentId, tracker] of this.trackers) {
      if (now - tracker.lastActivityTs > this.IDLE_THRESHOLD_MS) {
        this.emitAlert(
          agentId,
          "stalled",
          `No activity for ${Math.floor((now - tracker.lastActivityTs) / 1000)}s`
        );
      }
    }
  }

  private emitAlert(
    agentId: string,
    alertType: AlertEvent["alertType"],
    message: string,
    retryCount?: number,
    tokensBurned?: number
  ): void {
    const alert: AlertEvent = {
      type: "alert",
      ts: Date.now(),
      sessionId: this.sessionId,
      agentId,
      alertType,
      message,
      retryCount,
      tokensBurned,
    };
    this.bus.emit("event", alert);
  }
}
