#!/usr/bin/env bun

const cmd = process.argv[2];

const commands: Record<string, () => void> = {
  watch: () => {
    console.log("oswarm watch — coming soon");
  },
  run: () => {
    console.log("oswarm run — coming soon");
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
  status    show current swarm state`);
  process.exit(0);
}

const handler = commands[cmd];
if (!handler) {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}
handler();
