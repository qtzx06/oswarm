# oswarm

tasteful multi-agent conductor with reasoning-level observability.

spawns fleets of coding agents (claude code, codex, openclaw) via acp and agent sdk. the orchestrator encodes taste — smart decomposition, progressive context disclosure, ralph loop review cycles, quality grading, entropy management.

## install

```bash
bun install
```

## usage

```bash
# live tui dashboard
bun run watch

# execute a goal
oswarm run "refactor auth module"

# bootstrap harness in a repo
oswarm init

# check swarm state
oswarm status
```

## architecture

```
Types → Config → Providers → Protocol → Engine → Adapters → Skills → CLI
```

see [docs/superpowers/specs/2026-03-14-oswarm-architecture-design.md](docs/superpowers/specs/2026-03-14-oswarm-architecture-design.md) for the full spec.

## status

v0.0.1 — scaffolding phase. tui components built with ink, types defined, cli stubbed.
