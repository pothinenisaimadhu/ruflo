# Amazon Q — Obsidian Vault Rules + Code Understanding

## Vault Location & Purpose

This is the Obsidian knowledge vault for the **RuFlo v3.5** project located at:
`C:\Users\saima\Desktop\code\ruflo_project`

All `.md` files are Obsidian notes. Keep them in sync with actual code.

---

## Vault Structure

```
Vault_complete/
  RuFlo v3.5/
    🏠 RuFlo v3.5 — Home.md
    Architecture/
      System Overview.md
      Tech Stack.md
    Features/
      Agent Orchestration.md
      Intelligence & Learning.md
      MCP Integration.md
      Memory & Knowledge.md
      Performance & Optimization.md
      Security.md
    Components/
      MCP Bridge.md
      RuFloUI Dashboard.md
      Chat UI (Ruvocal).md
      Ollama MCP.md
    Flows/
      Request Flow.md
      Multi-Agent Pipeline.md
      Learning Loop.md
      Task Execution Flow.md
    Setup/
      Installation.md
      Environment Variables.md
      LLM Providers.md
    API & Tools/
      Tool Groups.md
      MCP Tools Reference.md
      CLI Commands.md
```

---

## Note-Writing Rules

1. Use Obsidian wiki-link syntax: `[[Note Name]]` or `[[Folder/Note Name]]`
2. Every note must have `up:: [[../🏠 RuFlo v3.5 — Home]]` at the top
3. When code changes, update the corresponding note
4. When adding a new note, add it to the Home navigation table
5. Use tables for structured data (env vars, tools, commands)
6. Use code blocks with language tags for all code snippets
7. Tags go at the bottom: `*Tags: #ruflo #feature-name*`
8. Related section at the bottom links to connected notes

## Code ↔ Note Mapping

| Code file / folder | Obsidian note to update |
|---|---|
| `ruflo/src/ruvocal/mcp-bridge/index.js` | `Components/MCP Bridge.md` |
| `ruflo/src/rufloui/src/backend/server.ts` | `Components/RuFloUI Dashboard.md` |
| `ruflo/src/rufloui/src/backend/llm-runner.ts` | `Components/RuFloUI Dashboard.md`, `Setup/LLM Providers.md` |
| `ruflo/src/ruvocal/` | `Components/Chat UI (Ruvocal).md` |
| `ruflo/src/mcp-bridge/ollama-mcp.js` | `Components/Ollama MCP.md` |
| `ruflo/docker-compose.yml` | `Setup/Installation.md` |
| `ruflo/.env` / `.env.example` | `Setup/Environment Variables.md` |
| `ruflo/src/nginx/nginx.conf` | `Architecture/System Overview.md` |
| `v3/@claude-flow/` | `Features/Agent Orchestration.md` |
| `v3/src/memory/` | `Features/Memory & Knowledge.md` |
| Any new feature added | Create new note in `Features/` + update Home |
| Any new component added | Create new note in `Components/` + update Home |

---

## System Architecture (Docker Compose)

Six services run together:

```
User Browser
    │
    ▼
[Nginx :3000]  ← reverse proxy, brand injection, CORS
    ├──► [Chat UI / Ruvocal :3000 internal]  ← SvelteKit chat interface
    │         └──► [MCP Bridge :3001]  ← tool gateway
    │                   ├──► ruvector (npx) — intelligence/learning tools
    │                   ├──► ruflo (npx) — agents/memory/devtools
    │                   ├──► agentic-flow (node) — 66+ specialized agents
    │                   ├──► ollama-mcp (node) — local LLM tools
    │                   └──► Gemini API / OpenAI / OpenRouter (HTTP)
    │
    └──► [RuFloUI :28580 internal]  ← React dashboard (swarm/task/agent mgmt)
              └──► LLM Runner (OpenRouter / OpenAI / Ollama)

[MongoDB :27017]  ← chat history persistence
[Ollama :11434]   ← local LLM inference
```

---

## MCP Bridge — Core Flow (`ruflo/src/ruvocal/mcp-bridge/index.js`)

This is the central tool gateway. Every AI tool call flows through here.

### Startup sequence
1. `main()` starts Express on port 3001
2. Reads `TOOL_GROUPS` config (env vars like `MCP_GROUP_INTELLIGENCE=true`)
3. Calls `initBackends()` — spawns child processes for each needed backend:
   - `npx ruvector mcp start` → intelligence tools (hooks_*)
   - `npx ruflo mcp start` → agents, memory, devtools, security, browser, neural
   - `node agentic-flow/standalone-stdio.js` → 66+ specialized agents
   - `node ollama-mcp.js` → local Ollama tools
4. Each backend is a `StdioMcpClient` — communicates via JSON-RPC over stdin/stdout

### Tool call flow
```
POST /mcp  (from Chat UI)
    │
    ▼
executeTool(name, args)
    ├── "search"       → Cloud Function or Gemini grounded search
    ├── "web_research" → Cloud Function or Gemini (supports goap pipeline)
    ├── "guidance"     → getGuidance() — returns AI instructions
    └── "backend__*"   → mcpBackends.get(backend).callTool(originalName, args)
                              └── StdioMcpClient._send("tools/call", ...)
                                      └── JSON-RPC over child process stdin
```

### Tool namespacing
- External tools are prefixed: `ruvector__hooks_route`, `ruflo__agent_spawn`
- `getActiveTools()` returns all filtered tools with namespaced names
- `filterToolsByGroups()` filters by enabled groups and prefix patterns
- Per-group endpoints: `POST /mcp/intelligence`, `POST /mcp/agents`, etc.
- Catch-all: `POST /mcp` serves all enabled tools

### GOAP search pipeline (web_research action='goap')
1. Decompose query into 3-4 sub-queries (via Gemini or Cloud Function)
2. Run all sub-queries in parallel
3. Synthesize results into a comprehensive answer
4. Optionally fact-check the synthesis
- Falls back to `executeGoapSearchGemini()` if no Cloud Function configured

### Chat completions proxy (`POST /chat/completions`)
- `resolveProvider(model)` → routes to openai / gemini / openrouter / ollama
- Injects `buildSystemPrompt()` as first system message (teaches AI all 200+ tools)
- If `x-autopilot: true` header → `handleAutopilot()` (agentic loop)
- Ollama models use native `/api/chat` endpoint (avoids auth issues)

### Autopilot mode (`handleAutopilot`)
- SSE stream to client
- Loop (max 50 steps):
  1. Call AI provider (non-streaming, with tool definitions)
  2. If AI returns tool calls → execute ALL in parallel via `executeTool()`
  3. Append results to message history
  4. Repeat until AI returns text (no tool calls) or max steps reached
- Blocked tools (deploy_, terminal_execute, etc.) pause the loop
- Detail store: full tool results stored with TTL, lazy-loaded via `/autopilot/detail/:token`

### StdioMcpClient internals
- Spawns child process, communicates via newline-delimited JSON-RPC
- `_send(method, params)` → writes to stdin, waits for response by UUID
- `_onData(chunk)` → buffers stdout, parses JSON lines, resolves pending promises
- 30s timeout per request, 5min startup timeout
- `callTool(originalName, args)` → wraps `_send("tools/call", ...)`

---

## MCP STDIO Kernel (`ruflo/src/ruvocal/mcp-bridge/mcp-stdio-kernel.js`)

A lightweight proxy that runs inside the Chat UI container:
- Reads JSON-RPC from stdin (from SvelteKit hooks.server.ts)
- Forwards to MCP Bridge over HTTP (`http://mcp-bridge:3001/mcp`)
- Caches tool list for 60 seconds (META_IDX_SEG)
- Signs requests with HMAC-SHA256 if `RVF_KERNEL_SECRET` is set (CRYPTO_SEG)
- This avoids the Chat UI needing direct HTTP access to the bridge

---

## RuFloUI Backend (`ruflo/src/rufloui/src/backend/server.ts`)

Express + WebSocket server on port 28580. The React dashboard's API.

### Key data stores (in-memory + persisted to `.ruflo/state.json`)
- `taskStore: Map<string, TaskRecord>` — all tasks
- `workflowStore: Map<string, WorkflowRecord>` — workflow records
- `sessionStore: Map<string, SessionRecord>` — saved sessions
- `agentRegistry: Map<string, {id, name, type}>` — keyed by created time (HH:MM:SS)
- `terminatedAgents: Set<string>` — created-time keys of terminated agents
- `agentActivity: Map<string, AgentActivity>` — real-time agent status
- `agentOutputBuffers: Map<string, string[]>` — last 500 lines per agent

### Persistence
- `saveToDisk()` → atomic write to `.ruflo/state.json` (write to .tmp then rename)
- `loadFromDisk()` → restores all stores on startup
- `scheduleSave()` → debounced 2s after any state change
- Task output lines persisted to `.ruflo/outputs/<taskId>.jsonl`

### WebSocket broadcast
- `broadcast(type, payload)` → sends to all connected WebSocket clients
- Also triggers `persistState()` for significant event types
- Forwards to Telegram bot if configured
- Updates webhook event status on task completion/failure

### Task execution flow
When a task is created and assigned:
1. `launchWorkflowForTask(taskId, title, description)`
2. Checks if swarm is active with agents:
   - **Multi-agent pipeline** (`launchSwarmPipeline`): coordinator plans → workers execute in waves → results stored in hive mind memory
   - **Single-agent fallback** (`launchViaClaude`): single LLM call with swarm prompt

### Multi-agent pipeline (3 phases)
```
Phase 1: Coordinator plans subtasks
  └── runClaude(planPrompt) → JSON array of {agent, task, depends_on}

Phase 2: Execute subtasks in dependency waves
  └── For each wave (parallel):
      └── runClaude(agentPrompt, roleSystemPrompt, agentId)
          └── runLlm() → streams chunks → broadcast('task:output')
          └── storeHiveMindMemory(key, result)  ← cross-task context

Phase 3: Mark complete
  └── broadcast('task:updated'), broadcast('workflow:updated')
  └── storeHiveMindMemory('task-result-<id>', summary)
```

### Hive Mind memory
- Stored in claude-flow memory namespace `hive-mind`
- `getHiveMindMemory()` → reads all keys, retrieves values via CLI
- `storeHiveMindMemory(key, value)` → stores via CLI (sanitized, max 300 chars)
- Injected as context into coordinator's planning prompt

### Webhook integration
- GitHub/GitLab webhooks → `createWebhookTask()`:
  1. Clone repo to `.ruflo/repos/<owner>/<repo>/`
  2. Create fix branch `fix/issue-<N>`
  3. Create task with `webhookMeta` attached
  4. On task completion → commit, push, create PR/MR, close issue

### API routes
| Route | Handler |
|---|---|
| `GET /api/system/health` | Runs `ruflo doctor`, parses checks |
| `GET /api/system/preflight` | Checks Node, npx, claude-flow, Claude CLI, disk |
| `POST /api/swarm/init` | Spawns 6 default agents (coordinator, 2x coder, researcher, tester, reviewer) |
| `POST /api/tasks` | Creates task, optionally launches workflow |
| `POST /api/tasks/:id/assign` | Assigns agent, launches workflow |
| `GET /api/swarm-monitor/snapshot` | Merges swarm status + agent list + health |
| `GET /api/swarm-monitor/activity` | Instant response from in-memory agentActivity |
| `POST /api/swarm-monitor/purge` | Kills all CLI agents, clears all registries |
| `GET /api/hive-mind/memory` | Merges hive-mind internal + pipeline memory |
| `GET /api/config/telegram` | Telegram bot config (token masked) |
| `POST /api/webhooks/github` | GitHub issue webhook handler |
| `POST /api/webhooks/gitlab` | GitLab issue webhook handler |

### Zombie reaper
- `startZombieReaper()` runs every 60s
- Kills any process with no output for `ZOMBIE_TIMEOUT` (default 5 min)
- Force-kills after 5s if SIGTERM doesn't work

---

## LLM Runner (`ruflo/src/rufloui/src/backend/llm-runner.ts`)

Abstracts LLM providers for the multi-agent pipeline.

### Provider resolution (priority order)
1. `LLM_PROVIDER` env var (explicit override)
2. `OPENROUTER_API_KEY` present → OpenRouter
3. `OPENAI_API_KEY` present → OpenAI
4. Fallback → Ollama (local)

### Default models
- OpenRouter: `openai/gpt-oss-120b:free` (or `LLM_MODEL` env)
- OpenAI: `gpt-4o-mini`
- Ollama: `OLLAMA_DEFAULT_MODEL` (default: `llama3.2`)

### Streaming
- `planOnly=true` → single non-streaming call (for coordinator planning)
- `planOnly=false` → SSE streaming, calls `onChunk(text)` for each delta
- Ollama uses `/api/chat` (NDJSON), OpenAI-compat uses SSE `data:` lines

---

## Tool Groups (env-controlled)

| Group | Env var | Default | Backend | Key prefixes |
|---|---|---|---|---|
| core | always on | on | builtin | search, web_research, guidance |
| intelligence | MCP_GROUP_INTELLIGENCE | on | ruvector | hooks_* |
| agents | MCP_GROUP_AGENTS | on | ruflo | agent_, swarm_, task_, session_, hive-mind_, workflow_, coordination_ |
| memory | MCP_GROUP_MEMORY | on | ruflo | memory_, agentdb_, embeddings_, knowledge_ |
| devtools | MCP_GROUP_DEVTOOLS | on | ruflo | hooks_, analyze_, performance_, github_, terminal_, config_, system_, progress_ |
| security | MCP_GROUP_SECURITY | off | ruflo | aidefence_, claims_, transfer_ |
| browser | MCP_GROUP_BROWSER | off | ruflo | browser_ |
| neural | MCP_GROUP_NEURAL | off | ruflo | neural_, daa_ |
| agentic-flow | MCP_GROUP_AGENTIC_FLOW | off | agentic-flow | agentic_flow_, agent_booster_, agentdb_ |
| ollama | MCP_GROUP_OLLAMA | off | ollama-mcp | (all) |
| claude-code | MCP_GROUP_CLAUDE_CODE | off | claude | (all) |
| gemini | MCP_GROUP_GEMINI | off | gemini-mcp | (all) |
| codex | MCP_GROUP_CODEX | off | codex | (all) |

---

## Key Flows to Know

### "User sends a chat message"
```
Chat UI (SvelteKit) → POST /chat/completions (mcp-bridge)
  → buildSystemPrompt() injected
  → resolveProvider(model) → upstream LLM API
  → LLM returns tool_calls → executeTool() → backend child process
  → result streamed back to Chat UI
```

### "User creates a task in RuFloUI"
```
React UI → POST /api/tasks {title, description, assignTo}
  → taskStore.set(id, task)
  → broadcast('task:added')
  → launchWorkflowForTask(id, title, description)
      → if swarm active: launchSwarmPipeline()
          → Phase 1: coordinator plans via runLlm()
          → Phase 2: workers execute in parallel waves via runLlm()
          → Phase 3: broadcast completion
      → else: launchViaClaude() → single runLlm() call
```

### "Swarm init"
```
POST /api/swarm/init {topology, maxAgents, strategy}
  → execCli('swarm', ['init', ...])
  → purgeAllCliAgents() — clean slate
  → spawn 6 default agents via execCli('agent', ['spawn', ...])
  → agentRegistry.set(createdTime, {id, name, type})
  → broadcast('swarm:status', result)
```

### "GitHub webhook fires"
```
POST /api/webhooks/github
  → verify HMAC signature
  → parse issue event
  → createWebhookTask('github', title, description, issueUrl)
      → cloneWebhookRepo() → git clone to .ruflo/repos/
      → git checkout -b fix/issue-N
      → taskStore.set(id, task with webhookMeta)
      → launchWorkflowForTask()
  → on task completion:
      → git add -A && git commit && git push
      → createGitHubPRAndCloseIssue()
```

---

## Important Implementation Details

- `agentRegistry` is keyed by **local time string** (HH:MM:SS) because the CLI `agent list` table only shows local time, not full ISO timestamps. This is how spawned agents are matched to CLI list rows.
- `allTerminatedBefore` is an ISO timestamp — any CLI agent created before this is filtered out (used by "terminate all")
- `currentSwarmAgentIds` tracks which agent IDs belong to the current swarm (for `?current=true` filter in swarm-monitor)
- The `execCli()` function uses `execFileAsync` (not shell) to avoid argument injection, but falls back to shell for some commands
- `sanitizeShellArg()` strips shell metacharacters before any shell-mode spawn
- Telegram config is stored in `.ruflo/telegram.json` with `chmod 600` (owner-only)
- State saves are debounced 2s and also run every 30s as a safety net
- The ruvocal `mcp-bridge/index.js` has a 300s (5min) backend startup timeout vs the `src/mcp-bridge/index.js` which has 60s — the ruvocal version is the one used in Docker
