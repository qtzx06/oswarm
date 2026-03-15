# oswarm Research Synthesis — March 2026

Synthesized from 5 parallel research agent runs covering: OpenClaw architecture, Claude Code agent internals, ACP protocol spec, cloud sandbox options, and OpenClaw skills format.

---

## 1. ACP (Agent Client Protocol) — The Wire Protocol

### What It Is

ACP is Zed Industries' open standard (v0.11.2, 2.4k stars, actively developed) for connecting editors to coding agents. It is JSON-RPC 2.0 over stdio, analogous to LSP but for AI agents. The canonical spec repo is `agentclientprotocol/agent-client-protocol`.

**IMPORTANT DISAMBIGUATION**: Three different things are called "ACP":
- **Agent Client Protocol** (Zed) — editor-to-agent, JSON-RPC/stdio. THIS is the live one.
- **Agent Communication Protocol** (IBM/BeeAI) — agent-to-agent, **archived** August 2025.
- **Agent Connect Protocol** (Agntcy/Cisco) — REST-based remote agent invocation, separate ecosystem.

### Message Lifecycle

```
Client -> Agent: initialize          (capability exchange)
Client -> Agent: session/new         (or session/load to resume)
Client -> Agent: session/prompt      (user turn, ContentBlock[])
Agent  -> Client: session/update     (streaming notification, repeated)
Agent  -> Client: session/prompt     (response with stop reason)
```

All `params` objects carry optional `_meta: { [key: string]: unknown }`.

### Key Methods

**Agent-side (client calls):** `initialize`, `authenticate`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `session/list`, `session/set_mode`

**Client-side (agent calls):** `session/request_permission`, `fs/read_text_file`, `fs/write_text_file`, `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release`

**Proposed (Draft):** `mcp/connect`, `mcp/message`, `mcp/disconnect` — MCP tunneled over ACP stdio

### ContentBlock Union

`text | image | audio | resource_link | resource` — all agents must support `text` and `resource_link`.

### SessionUpdate Variants (streaming notifications)

`user_message_chunk`, `agent_message_chunk`, `tool_call_update`, `plan_update`, `content_block_update`, `current_mode_update`, `session_info_update`

### Auth

Agent returns `authMethods[]` during `initialize`. Client calls `authenticate({ methodId })`. Error `-32000` = auth_required.

### What Does NOT Exist Yet in ACP

- Direct agent-to-agent sessions (ACP is 1:1 client:agent)
- Built-in agent discovery or task routing
- State sharing across agents
- Standardized load balancing
- Production implementations of Proxy Chains, MCP-over-ACP, or telemetry export RFDs

### ACP vs MCP

Complementary, not competing. ACP = editor-to-agent. MCP = agent-to-tools. ACP sessions pass `mcpServers[]` at creation, making MCP native to ACP. MCP-over-ACP RFD proposes tunneling MCP tool calls back through the ACP stdio channel (no separate process/port needed).

### ACP Registry

40+ agents verified via CI at `agentclientprotocol/registry`. Key agents: Claude (via Zed adapter), Gemini CLI, GitHub Copilot, Codex (community bridge), Cline, goose, JetBrains Junie, Kimi CLI, Qwen Code, Mistral Vibe, Factory Droid. Key clients: Zed (native), JetBrains (in progress), AionUi, Neovim.

---

## 2. OpenClaw Architecture

### Disambiguation

OpenClaw (formerly Clawdbot/Moltbot) is NOT Cline. Separate codebase at `openclaw/openclaw` (313k stars, TypeScript). The ACP extension lives at `openclaw/acpx`.

### Two Separate Agent Spawn Runtimes

This is architecturally critical:

- **Runtime A: `runtime="subagent"`** — OpenClaw's internal runner. Same model loop as parent, child session key format: `agent:{agentId}:subagent:{uuid}`
- **Runtime B: `runtime="acp"`** — Delegates to external ACP CLI agent (Claude Code, Codex, etc.) via `acpx`. Session key format: `acp:*`

**Constraint**: Sandboxed sessions CANNOT spawn ACP sessions (ACP runs on host). Use `runtime="subagent"` from sandboxed contexts.

### ACPX Deep Dive

ACPX is the standalone ACP client that OpenClaw uses to orchestrate external agents.

**Agent Registry** (hardcoded, 13 built-in agents):
```
claude:   npx -y @zed-industries/claude-agent-acp@^0.21.0
codex:    npx @zed-industries/codex-acp@^0.9.5
gemini:   gemini --acp
openclaw: openclaw acp
copilot:  copilot --acp --stdio
kiro:     kiro-cli acp
...
```
No arbitrary ACP server binaries yet (open issue #40274).

**Session Persistence**: Flat JSON files in `~/.acpx/sessions/`. Schema `acpx.session.v1` includes: `acpSessionId`, `agentCommand`, `cwd`, `lastSeq`, `messages[]`, `cumulative_token_usage`, `eventLog`.

**Event Log**: Segmented NDJSON at `~/.acpx/sessions/<id>.stream.ndjson` with rotation at 64MB, max 5 segments. Each line is one raw ACP JSON-RPC message.

**Queue Owner Pattern**: When multiple `acpx send` calls hit the same session, acpx spawns itself as a detached child process holding a lease file, serving an IPC socket for prompt submission (max queue depth 16, heartbeat every 5s, TTL 300s).

**Output Format**: `--format json` emits NDJSON to stdout — raw ACP JSON-RPC messages followed by final result or error.

### Permission Modes

`approve-all` (full autonomy), `approve-reads` (reads free, writes/exec gated), `deny-all` (all blocked). Queue owner defaults to `approve-reads`.

### Thread-Bound ACP Sessions

Two modes: `mode="run"` + `thread=false` (oneshot) vs `mode="session"` + `thread=true` (persistent, bound to messaging thread in Discord/Slack).

### Observability

- Rolling NDJSON log: `~/.openclaw/tmp/openclaw-YYYY-MM-DD.log`, 500MB cap per file, structured JSON via tslog
- Per-session NDJSON event streams in `~/.acpx/sessions/`
- HTTP webhook inbound system (`/hooks` endpoint with bearer token, idempotency keys)
- Internal hooks system for lifecycle events
- No built-in dashboard

---

## 3. Claude Code Agent Internals

### ACP Integration

Claude Code CLI has NO `--acp` flag. ACP is mediated by `@zed-industries/claude-agent-acp` adapter (wraps the Claude Agent SDK). The deprecated community project `Xuanwo/acp-claude-code` was superseded by this.

### Agent Teams (Experimental, v2.1.32+)

Enable: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

**Architecture**: Team lead + teammates, each with own context window. Shared task list (pending/in-progress/completed) with file-locking for race-free claiming. Async mailbox messaging.

**Communication**: `message` (targeted), `broadcast` (all teammates). Automatic idle notifications and dependency resolution.

**Display modes**: in-process (default, Shift+Down to cycle), tmux (each teammate in split pane), iTerm2.

**Constraints**: No nested teams. Teammates cannot spawn sub-teams or promote to lead. Only `command` hook type supported for team events.

**Storage**: `~/.claude/teams/{team-name}/config.json`, `~/.claude/tasks/{team-name}/`

### Custom Subagents (`.claude/agents/*.md`)

Frontmatter-configured agents with these fields: `name`, `description`, `tools`, `disallowedTools`, `model` (sonnet/opus/haiku/inherit), `permissionMode`, `maxTurns`, `isolation` (worktree), `background`, `mcpServers`, `hooks`, `skills`, `memory`.

**Key capability — `isolation: worktree`** (v2.1.48+): Runs in isolated git worktree, auto-cleaned if no changes. Custom worktree creation via `WorktreeCreate` hook (stdout = path).

**MCP in subagents**: Inherit parent MCP servers by default. Can add subagent-scoped inline MCP servers. String name references share parent connection.

**Context**: Each subagent gets its own fresh context window. Only the explicit prompt string carries over, not parent conversation history.

### Built-in Subagent Types

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| Explore | Haiku | Read-only | Codebase search |
| Plan | Inherits | Read-only | Plan-mode research |
| general-purpose | Inherits | All | Complex multi-step |
| Bash | Inherits | Bash context | Command execution |

Tool renamed from `Task` to `Agent` in v2.1.63 — check both for compatibility.

### Hooks System — Full Event List

**Blocking hooks** (exit 2 = block, exit 0 = allow with stdout as context):
`UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `SubagentStop`, `Stop`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `Elicitation`, `ElicitationResult`

**Non-blocking hooks**:
`SessionStart`, `SessionEnd`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`, `InstructionsLoaded`, `WorktreeRemove`, `PreCompact`, `PostCompact`

**Hook types**: `command`, `http`, `prompt`, `agent` — though team hooks only support `command`.

**JSON output format for hooks** supports: `decision`, `reason`, `hookSpecificOutput` with `permissionDecision` (allow/deny/ask), `updatedInput`, `additionalContext`.

### OTLP/OpenTelemetry Export

Enable: `CLAUDE_CODE_ENABLE_TELEMETRY=1`

**Metrics** (service: `claude-code`, meter: `com.anthropic.claude_code`):
`session.count`, `lines_of_code.count`, `pull_request.count`, `commit.count`, `cost.usage` (USD), `token.usage`, `code_edit_tool.decision`, `active_time.total`

**Events** (via logs protocol):
`user_prompt`, `tool_result`, `api_request`, `api_error`, `tool_decision` — all share `prompt.id` UUID for request tracing.

Key env vars: `OTEL_METRICS_EXPORTER`, `OTEL_LOGS_EXPORTER`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL` (grpc/http+json/http+protobuf), `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_DETAILS`.

Dynamic header refresh via `otelHeadersHelper` script for OAuth token rotation.

### Claude Agent SDK

Packages: `@anthropic-ai/claude-agent-sdk` (TypeScript), `claude-agent-sdk` (Python).

Core API: `query({ prompt, options })` returns async iterator of messages. Options include: `allowedTools`, `permissionMode`, `mcpServers`, `agents`, `hooks`, `resume` (session ID), `agentProgressSummaries`.

Session utilities: `listSessions`, `getSessionInfo`, `getSessionMessages`, `renameSession`, `tagSession`, `forkSession`.

---

## 4. ACP Protocol — Draft RFDs (Not Yet Implemented)

### Proxy Chains (`proxy-chains.mdx`)
Author: Niko Matsakis. Architecture: `Client -> Conductor -> Proxy1 -> Proxy2 -> ... -> Agent`. Single new method: `proxy/successor`. Proxies inject context into prompts, filter/augment responses. No agent discovery — agents are pre-configured. Fan-out to multiple agents is flagged as future work.

Reference impl: `sacp-conductor` crate in `anthropics/rust-sdk`.

### MCP-over-ACP (`mcp-over-acp.mdx`)
Author: Niko Matsakis. Enables ACP proxies to inject MCP tool servers living in the proxy's address space, routed through ACP stdio (no HTTP port needed). Explicitly calls out WASM sandbox as future use case.

### Meta Propagation (`meta-propagation.mdx`)
Reserves `_meta.traceparent`, `_meta.tracestate`, `_meta.baggage` for W3C Trace Context.

### Agent Telemetry Export (`agent-telemetry-export.mdx`)
Clients inject `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_SERVICE_NAME` env vars when spawning agent subprocesses. Telemetry is out-of-band from ACP stdio to avoid head-of-line blocking.

---

## 5. Cloud Sandbox Options

### Recommendations for oswarm

| Use Case | Best Option | Why |
|----------|-------------|-----|
| Safe Claude Code execution | **E2B** | Official templates, Firecracker microVMs, ~150ms boot, 24h sessions (Pro) |
| Persistent state across sessions | **Fly.io Sprites** | 100GB S3-backed filesystem, checkpoint/restore in ~1s, $0 idle compute |
| Agent swarms with networking | **Fly.io Machines** | Private WireGuard mesh between machines, per-second billing, $0 when stopped |
| GPU/local LLM workloads | **Modal** | Only mature GPU sandbox option, gVisor isolation, 24h max, snapshots |
| Fastest resume | **Blaxel** | ~25ms resume from standby, perpetual standby at $0 compute |
| Browser/computer use | **Daytona** | Built-in browser automation, MCP server, ~90ms cold start |
| Orchestration layer | **Warp Oz** | Teams, scheduling, audit trails, session sharing links |

### Key Pricing (normalized)

- E2B: ~$0.08/hr (1 vCPU/512MB)
- Modal: ~$0.12/hr (most expensive, but has GPUs)
- Fly.io Machines: ~$0.04-$0.37/hr (cheapest at low end, $0 when stopped)
- Fly.io Sprites: ~$0.07/CPU-hr ($0 idle)
- Daytona: ~$0.08/hr
- Blaxel: ~$0.08/hr

### Isolation Models

- **Firecracker microVMs** (E2B, Fly.io, Sprites, Blaxel): Strongest isolation, dedicated kernel per sandbox
- **gVisor** (Modal): User-space kernel, weaker than Firecracker but faster startup
- **Docker containers** (Daytona): Shared host kernel, weakest isolation, fastest cold start (~90ms)

### Networking for Swarms

Fly.io Machines is the standout: all machines in an org share a private WireGuard mesh (`fdaa::/8`), reachable by hostname on `.internal` DNS with zero config. This is ideal for agent-to-agent communication.

Modal uses tunnels + shared data primitives (`modal.Queue`, `modal.Dict`). No native private mesh.

E2B sandboxes are isolated by default; inbound requires traffic token.

---

## 6. OpenClaw Skills Architecture (Incomplete Research)

### Skill Format

A skill is a **directory** containing a `SKILL.md` (or `skill.md`) file with YAML frontmatter, plus optional supporting text files.

**Required frontmatter**: `name`, `description`

**Optional frontmatter**: `version` (semver), `homepage`, `user-invocable` (boolean, controls slash command), `disable-model-invocation`, `command-dispatch` ("tool" to bypass model), `command-tool`, `command-arg-mode`

**Runtime metadata** (`metadata.openclaw`): `requires.env`, `requires.bins`, `requires.anyBins`, `requires.config`, `primaryEnv`, `always`, `skillKey`, `emoji`, `os`, `install` (array of installer specs: brew/node/go/uv/download)

### Load Precedence

1. Workspace skills (`<workspace>/skills/`) — highest priority
2. Managed/local skills (`~/.openclaw/skills/`)
3. Bundled skills (shipped with install)

Plugin skills participate in normal precedence when their plugin is enabled.

### Execution Model

- Skills are **snapshotted at session start** and reused for all turns in that session
- Hot reloading via skills watcher (configurable) — changes take effect on new sessions or mid-session when watcher triggers
- Eligible skills are injected as compact XML into system prompt (cost: 195 chars base + ~97 chars per skill)
- When `command-dispatch: tool`, slash commands bypass model inference and dispatch directly to tools with `{ command, commandName, skillName }`

### ClawHub Registry

Public skills registry at clawhub.com (2,857+ skills). Backend: Convex (DB + storage + actions). CLI: `clawhub install/update/sync`. Vector search over skill text + metadata. GitHub OAuth login. Versioning with semver + tags + changelog.

Install flow: resolve latest version -> download zip -> extract to `./skills/<slug>` -> persist state in `.clawhub/lock.json` + `<skill>/.clawhub/origin.json`.

---

## 7. Key Surprises and Counterintuitive Findings

1. **Claude Code has NO `--acp` flag.** ACP support requires a separate adapter package (`@zed-industries/claude-agent-acp`). The CLI speaks a proprietary JSON protocol over stdio, not ACP natively.

2. **OpenClaw has TWO completely separate spawn runtimes** (subagent vs ACP) with different session key formats, causing a regression in 2026.3.8 because `isSubagentSessionKey()` only matched `subagent:*`, not `acp:*`.

3. **ACP is 1:1 only.** No native multi-agent support. Multi-agent coordination requires the Proxy Chains RFD which is still Draft with no production implementations.

4. **ACPX spawns itself** as a detached child process (queue owner pattern) to handle concurrent session access. The queue owner holds a lease file and serves an IPC socket.

5. **The ACPX agent registry is hardcoded.** You cannot point to an arbitrary ACP server binary — only the 13 built-in agent names are recognized. Custom agents require code changes.

6. **IBM's competing "Agent Communication Protocol" was archived** (Aug 2025). Google's A2A (donated to Linux Foundation, 50+ partners) is the leading agent-to-agent standard, sitting alongside rather than inside ACP.

7. **Fly.io Sprites are brand new** (Jan 2026) and have the best economics for persistent agent sessions: checkpoint/restore in ~1s, $0 idle compute, 100GB permanent storage. This didn't exist 3 months ago.

8. **Claude Code Agent Teams cannot nest.** No sub-teams, no teammate promotion to lead. Only `command` hook type for team events (not `http`/`prompt`/`agent`).

9. **Sandboxed sessions cannot spawn ACP sessions** in OpenClaw because ACP runs on the host. This is a fundamental architectural constraint for any sandbox-based swarm.

10. **There is no bidirectional bridge** between OpenClaw's session format and Claude Code's `~/.claude/` files. Communication is one-way: OpenClaw orchestrates -> ACP adapter -> Claude Code. Both sides store session history independently.

---

## 8. Implications for oswarm Design

### What Already Exists (Don't Rebuild)
- ACP as wire protocol for spawning/controlling coding agents
- Claude Agent SDK for programmatic Claude Code sessions
- Claude Code hooks for lifecycle interception
- OTLP telemetry export from Claude Code
- Fly.io WireGuard mesh for inter-agent networking
- OpenClaw's queue owner pattern for concurrent session access

### What's Missing (Build Opportunities)
- Agent-to-agent communication protocol (ACP is client-agent only)
- Agent discovery and dynamic registration (ACPX registry is hardcoded)
- Task routing and load balancing across agents
- Shared state/context between agents beyond file system
- Sandbox-aware ACP spawning (currently blocked by architecture)
- Unified observability dashboard across agent sessions
- Cross-agent session bridging (each agent stores history independently)
