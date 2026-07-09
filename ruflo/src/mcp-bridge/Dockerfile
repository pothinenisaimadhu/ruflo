FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --production

# Pre-install MCP backends for faster startup (avoids npx download on first call)
# Each installed separately so one failure doesn't block others
RUN npm install -g ruvector || true
RUN npm install -g ruflo || true
RUN npm install -g agentic-flow@alpha || true
RUN npm install -g gemini-mcp-server || true
RUN npm install -g @openai/codex || true

COPY index.js ./
COPY mcp-stdio-kernel.js ./
COPY ollama-mcp.js ./

# Create writable directories for MCP backends (ruflo, ruvector, agentic-flow)
# These tools write state/tasks/memory to the working directory at runtime
RUN mkdir -p /app/.claude-flow/tasks /app/.claude-flow/memory /app/.claude-flow/sessions \
    /app/.claude-flow/agents /app/.claude-flow/config /app/.claude-flow/data \
    /app/.claude-flow/logs /app/.claude-flow/swarm \
    && chown -R node:node /app/.claude-flow

USER node

EXPOSE 3001

ENV PORT=3001
# Ollama
ENV OLLAMA_URL=http://ollama:11434
ENV OLLAMA_DEFAULT_MODEL=deepseek-v4-flash:cloud
# Tool groups — defaults only, overridden by docker-compose environment
ENV MCP_GROUP_INTELLIGENCE=true
ENV MCP_GROUP_AGENTS=true
ENV MCP_GROUP_MEMORY=true
ENV MCP_GROUP_DEVTOOLS=true
ENV MCP_GROUP_SECURITY=true
ENV MCP_GROUP_BROWSER=true
ENV MCP_GROUP_NEURAL=true
ENV MCP_GROUP_AGENTIC_FLOW=true
ENV MCP_GROUP_CLAUDE_CODE=false
ENV MCP_GROUP_GEMINI=true
ENV MCP_GROUP_CODEX=true
ENV MCP_GROUP_OLLAMA=true

CMD ["node", "index.js"]
