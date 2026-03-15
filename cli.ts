#!/usr/bin/env bun

const cmd = process.argv[2];
const args = process.argv.slice(3);

const commands: Record<string, () => Promise<void> | void> = {
  watch: async () => {
    const { startWatch } = await import("./src/cli.tsx");
    await startWatch();
  },
  run: async () => {
    const goal = args.join(" ");
    if (!goal) {
      console.error("usage: oswarm run <goal>");
      process.exit(1);
    }

    const { createOrchestrator } = await import("./src/orchestrator.ts");
    const orchestrator = await createOrchestrator(process.cwd());

    console.log(`oswarm — running: "${goal}"`);
    console.log(`adapters: ${[...orchestrator.adapters.keys()].join(", ")}`);
    console.log("---");

    for await (const event of orchestrator.run(goal)) {
      if (event.type === "tool_use") {
        console.log(`  [${event.agentId}] tool: ${event.data.tool}`);
      }
      if (event.type === "progress" && event.data.text) {
        const text = String(event.data.text).slice(0, 120);
        console.log(`  [${event.agentId}] ${text}`);
      }
      if (event.type === "reasoning") {
        const content = String(event.data.content).slice(0, 200);
        console.log(`  [${event.agentId}] thinking: ${content}...`);
      }
      if (event.type === "error") {
        console.error(`  [${event.agentId}] ERROR: ${event.data.error}`);
      }
      if (event.type === "complete") {
        console.log(`  [${event.agentId}] done.`);
        if (event.data.costUsd) {
          console.log(`  cost: $${Number(event.data.costUsd).toFixed(4)}`);
        }
      }
    }

    console.log("---");
    console.log("oswarm run complete.");
  },
  init: () => {
    console.log("oswarm init — coming soon");
  },
  status: () => {
    console.log("oswarm status — coming soon");
  },
};

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(`oswarm v0.0.1 — tasteful multi-agent conductor

commands:
  watch     live tui dashboard
  run       execute a goal with agent swarm
  init      bootstrap harness structure
  status    show current swarm state

usage:
  oswarm run "refactor auth module"
  oswarm watch --demo
  oswarm init`);
  process.exit(0);
}

const handler = commands[cmd];
if (!handler) {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}
await handler();
