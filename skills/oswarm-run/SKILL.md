---
name: oswarm-run
description: spawn a multi-agent swarm to accomplish a goal — decomposes tasks, assigns agents, manages worktrees
version: 0.0.1
user-invocable: true
---

# oswarm run

You are invoking the oswarm multi-agent conductor. This skill spawns autonomous coding agents (via Claude Agent SDK or ACP) in isolated worktrees to accomplish a goal.

## Usage

Run the oswarm CLI to spawn agents:

```bash
~/.bun/bin/oswarm run "<the user's goal>"
```

The orchestrator will:
1. Create an isolated git worktree for the task
2. Spawn a coding agent with full autonomy
3. Stream progress events (tool use, reasoning, completion)
4. Report results when done

## When to use

Use this when the user asks you to:
- Work on a complex task that benefits from agent isolation
- Run multiple agents in parallel on subtasks
- Orchestrate coding work with quality controls

## Output

The CLI streams NDJSON events to stdout. Parse them to track agent progress.
