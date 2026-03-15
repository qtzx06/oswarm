# design addendum — autonomy, auto-spawn, multi-modal

## full autonomy

agents run with zero permission prompts. the orchestrator is the trust boundary.

- cc agents: `--dangerously-skip-permissions` / agent sdk equivalent
- openclaw/acpx: `approve-all` permission mode
- cloud adapters: no sandbox permission gates

if an agent needs to ask for permission, the harness is broken.

## auto-spawn chain

when a subagent returns results, the next agent in the DAG fires instantly. no human gate between steps. the dag executor watches for dependency resolution and dispatches with zero delay.

```
agent-a completes task-1
    → orchestrator receives result
    → task-2 dependency resolved
    → agent-b spawns immediately (same tick)
```

for openclaw specifically: session should insta-spawn a new agent after subagent returns to the main session. make this an explicit rule in the adapter.

for cc: same pattern via agent sdk — `query()` returns, next `query()` fires.

## multi-modal tooling

agents aren't just coders. the skill loadout includes:

- **gemini image gen** — asset generation, mockups, diagrams
- **x api** — research, trend analysis, idea validation
- **browser/cdp** — ui validation, screenshots, dom snapshots (openai pattern)
- **observability queries** — logql, promql for debugging tasks

the skill registry should surface non-coding skills when task analysis detects the need.

## hackathon submission

track: new agent skills

tech stack: bun, typescript, react, ink, acp, claude agent sdk, gemini api, x api, skillboss, opentelemetry
