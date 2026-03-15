# oswarm

tasteful multi-agent conductor with reasoning-level observability.

spawns fleets of coding agents (claude code, codex, openclaw) via acp and agent sdk. the orchestrator encodes taste — smart decomposition, progressive context disclosure, ralph loop review cycles, quality grading, entropy management.

nobody has shipped a portable, reusable version of what openai hand-built for their internal codex codebase. oswarm makes harness engineering patterns framework-level primitives.

## install

```bash
bun install
bun link
```

then from anywhere:

```bash
oswarm run "make me a game"
```

or add to your path permanently:

```bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

## usage

```
$ oswarm --help

oswarm v0.0.1 — tasteful multi-agent conductor

commands:
  watch     live tui dashboard
  run       execute a goal with agent swarm
  init      bootstrap harness structure
  status    show current swarm state

usage:
  oswarm run "refactor auth module"
  oswarm watch --demo
  oswarm init
```

```bash
# spawn a swarm on any goal
oswarm run "refactor auth module"

# live tui — watch agents think in real-time
oswarm watch

# demo mode with mock agents
oswarm watch --demo

# bootstrap harness structure in any repo
oswarm init

# check current swarm state
oswarm status
```

## desktop tui

three-pane ink terminal dashboard. tasks on the left, agent feed in the center, reasoning stream on the right. live cost tracking, elapsed time, alert detection for stuck/spinning agents.

```
┌─ TASKS ──────────┬─ AGENTS ─────────────────────┬─ REASONING ────────────┐
│ ● refactor auth  │ [agent-1] cc wt:auth-types   │ agent-1:               │
│  ├─✓ analyze deps│  → reading src/auth/mid...   │ "the auth module has   │
│  ├─● extract types│  2m14s · 1.2k tokens        │  3 concerns tangled…"  │
│  ├─● write tests │                              │                        │
│  │  ├─● unit     │ [agent-2] codex wt:auth-tests│ agent-2:               │
│  │  └─○ integr.  │  → running tests (14/27)     │ "test suite has 13     │
│  ├─● split module│  4m01s · 3.9k tokens         │  failures remaining…"  │
│  └─○ update docs │  ⚠ STUCK — retried 4x        │                        │
│                  │                              │ agent-3:               │
│ ✓ done ● active  │ [agent-3] cc wt:auth-split   │ "chose to split        │
│ ○ pending ✕ fail │  → writing src/auth/sess...  │  session handling…"    │
│                  │  1m29s · 2.1k tokens         │                        │
├──────────────────┴──────────────────────────────┴────────────────────────┤
│ [q]uit [k/j]nav [enter]expand [?]help   3 agents  $0.47  6m00s          │
└─────────────────────────────────────────────────────────────────────────┘
```

## architecture

```
types → config → providers → protocol → engine → adapters → skills → cli
```

the conductor engine has five subsystems that encode orchestration taste:

- **task decomposer** — llm-driven goal → dag breakdown with isolation/model/context routing
- **context router** — progressive disclosure, ~100 line agents.md as map not manual
- **ralph loop runner** — agent-to-agent review cycles until consensus or escalation
- **quality grader** — structural tests, linter compliance, doc freshness scoring
- **entropy manager** — periodic garbage collection agents fixing drift and pattern violations

agents nest n-deep. oswarm sets up the worktree environment (subagent definitions, hooks, taste-specs, linters) and constraints propagate to arbitrary depth without direct management. harness engineering applied to agent nesting.

full spec: [docs/superpowers/specs/2026-03-14-oswarm-architecture-design.md](docs/superpowers/specs/2026-03-14-oswarm-architecture-design.md)

## agent adapters

| adapter | mechanism | sweet spot |
|---------|-----------|------------|
| claude code | agent sdk `query()` | primary local adapter |
| openclaw | acpx `sessions_spawn` | session persistence |
| codex | acpx | acp json-rpc over stdio |
| e2b | e2b sdk | safe sandboxed execution |
| fly.io | machines api | networked swarms (wireguard mesh) |
| modal | `modal.Function` | gpu workloads |

## skills

installable in claude code (`~/.claude/skills/`) and openclaw (`./skills/`):

- **oswarm-orchestrate** — the conductor itself as a skill
- **oswarm-worker** — teaches agents how to decompose and self-organize
- **oswarm-observe** — reasoning trace extraction and correlation
- **oswarm-review** — ralph loop review orchestration
- **oswarm-research** — deep codebase exploration

## tech stack

bun, typescript, react, ink, acp, claude agent sdk, opentelemetry

## status

v0.0.1 — working. `oswarm run` spawns real cc agents via agent sdk. acpx adapter for codex/openclaw. three-pane tui with live observability. dag executor, worktree isolation, structural tests. 9 tests passing.
