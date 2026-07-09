#!/usr/bin/env node
/**
 * ollama-mcp.js — Ollama MCP stdio server
 * Exposes Ollama as MCP tools: chat, generate, list models, pull model, embeddings.
 * Runs as a child process inside the mcp-bridge container.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || "http://ollama:11434";

const TOOLS = [
  {
    name: "ollama_chat",
    description: "Chat with a local Ollama model. Fast, free, private — no API key needed. Use for any text generation, coding, analysis, or Q&A.",
    inputSchema: {
      type: "object",
      properties: {
        model:    { type: "string", description: "Model name (e.g. llama3, mistral, codellama, phi3). Defaults to OLLAMA_DEFAULT_MODEL env var.", default: process.env.OLLAMA_DEFAULT_MODEL || "llama3" },
        messages: { type: "array",  description: "Chat messages array [{role, content}]", items: { type: "object" } },
        prompt:   { type: "string", description: "Simple prompt (alternative to messages array)" },
        system:   { type: "string", description: "Optional system prompt" },
        temperature: { type: "number", description: "Sampling temperature 0-2", default: 0.7 },
        stream:   { type: "boolean", description: "Stream response (default false)", default: false },
      },
    },
  },
  {
    name: "ollama_generate",
    description: "Generate text completion with a local Ollama model (raw completion, no chat format).",
    inputSchema: {
      type: "object",
      properties: {
        model:  { type: "string", description: "Model name", default: process.env.OLLAMA_DEFAULT_MODEL || "llama3" },
        prompt: { type: "string", description: "Prompt text" },
        system: { type: "string", description: "Optional system prompt" },
        temperature: { type: "number", default: 0.7 },
      },
      required: ["prompt"],
    },
  },
  {
    name: "ollama_list_models",
    description: "List all locally available Ollama models that are downloaded and ready to use.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ollama_pull_model",
    description: "Download/pull an Ollama model from the registry. Use this to add new models.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", description: "Model name to pull (e.g. llama3, mistral, codellama:13b, phi3:mini)" },
      },
      required: ["model"],
    },
  },
  {
    name: "ollama_embeddings",
    description: "Generate vector embeddings for text using a local Ollama model.",
    inputSchema: {
      type: "object",
      properties: {
        model:  { type: "string", description: "Embedding model (e.g. nomic-embed-text, mxbai-embed-large)", default: "nomic-embed-text" },
        prompt: { type: "string", description: "Text to embed" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "ollama_status",
    description: "Check if Ollama is running and get server info.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── MCP stdio protocol ────────────────────────────────────────────────────────

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      handleMessage(JSON.parse(trimmed));
    } catch { /* skip non-JSON */ }
  }
});

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      send({ jsonrpc: "2.0", id, result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ollama-mcp", version: "1.0.0" },
      }});
      break;

    case "notifications/initialized":
      break;

    case "tools/list":
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      break;

    case "tools/call": {
      const { name, arguments: args = {} } = params;
      try {
        const result = await callTool(name, args);
        send({ jsonrpc: "2.0", id, result: {
          content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
        }});
      } catch (err) {
        send({ jsonrpc: "2.0", id, result: {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        }});
      }
      break;
    }

    default:
      if (id) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(name, args) {
  switch (name) {

    case "ollama_chat": {
      const model = args.model || process.env.OLLAMA_DEFAULT_MODEL || "llama3";
      let messages = args.messages;

      // Build messages from prompt if not provided
      if (!messages || messages.length === 0) {
        messages = [];
        if (args.system) messages.push({ role: "system", content: args.system });
        if (args.prompt) messages.push({ role: "user", content: args.prompt });
      }

      const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: false,
          options: args.temperature !== undefined ? { temperature: args.temperature } : {} }),
      });

      if (!resp.ok) throw new Error(`Ollama error ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      const content = data.message?.content || "";
      return `[ollama/${model}]\n\n${content}`;
    }

    case "ollama_generate": {
      const model = args.model || process.env.OLLAMA_DEFAULT_MODEL || "llama3";
      const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: args.prompt, system: args.system || "", stream: false,
          options: args.temperature !== undefined ? { temperature: args.temperature } : {} }),
      });

      if (!resp.ok) throw new Error(`Ollama error ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      return `[ollama/${model}]\n\n${data.response || ""}`;
    }

    case "ollama_list_models": {
      const resp = await fetch(`${OLLAMA_URL}/api/tags`);
      if (!resp.ok) throw new Error(`Ollama error ${resp.status}`);
      const data = await resp.json();
      const models = (data.models || []).map(m => ({
        name: m.name,
        size: m.size ? `${(m.size / 1e9).toFixed(1)}GB` : "unknown",
        modified: m.modified_at ? new Date(m.modified_at).toLocaleDateString() : "",
      }));
      if (models.length === 0) return "No models downloaded yet. Use ollama_pull_model to download one.";
      return `Available Ollama models (${models.length}):\n\n` +
        models.map(m => `• ${m.name} — ${m.size} (updated ${m.modified})`).join("\n");
    }

    case "ollama_pull_model": {
      const model = args.model;
      const resp = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model, stream: false }),
        signal: AbortSignal.timeout(600_000), // 10 min timeout for large models
      });
      if (!resp.ok) throw new Error(`Ollama pull error ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      return `Model '${model}' pull status: ${data.status || "ok"}`;
    }

    case "ollama_embeddings": {
      const model = args.model || "nomic-embed-text";
      const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: args.prompt }),
      });
      if (!resp.ok) throw new Error(`Ollama embeddings error ${resp.status}`);
      const data = await resp.json();
      const emb = data.embedding || [];
      return `Generated ${emb.length}-dimensional embedding using ${model}.\nFirst 5 values: [${emb.slice(0,5).map(v=>v.toFixed(4)).join(", ")}...]`;
    }

    case "ollama_status": {
      try {
        const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return `Ollama is reachable but returned status ${resp.status}`;
        const data = await resp.json();
        const count = (data.models || []).length;
        return `✅ Ollama is running at ${OLLAMA_URL}\n${count} model(s) available locally.\nUse ollama_list_models to see them.`;
      } catch (err) {
        return `❌ Ollama not reachable at ${OLLAMA_URL}: ${err.message}\nMake sure the ollama service is running.`;
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
