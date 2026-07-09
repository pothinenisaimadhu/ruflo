FROM node:20-slim

WORKDIR /app

# Python + build tools needed for agentic-flow's hnswlib-node native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --production

# Pre-install MCP backends
RUN npm install -g ruvector || true
RUN npm install -g ruflo || true
RUN npm install -g agentic-flow@alpha || true
RUN npm install -g gemini-mcp-server || true
RUN npm install -g @openai/codex || true

COPY index.js ./
COPY mcp-stdio-kernel.js ./

# Create writable directories for MCP backends (ruflo, ruvector, agentic-flow)
# These tools write state/tasks/memory to the working directory at runtime
RUN mkdir -p /app/.claude-flow/tasks /app/.claude-flow/memory /app/.claude-flow/sessions \
    /app/.claude-flow/agents /app/.claude-flow/config /app/.claude-flow/data \
    /app/.claude-flow/logs /app/.claude-flow/swarm \
    && chown -R node:node /app/.claude-flow

USER node

EXPOSE 3001

ENV PORT=3001
# Default-on tool groups
ENV MCP_GROUP_INTELLIGENCE=true
ENV MCP_GROUP_AGENTS=true
ENV MCP_GROUP_MEMORY=true
ENV MCP_GROUP_DEVTOOLS=true
# Opt-in tool groups
ENV MCP_GROUP_SECURITY=true
ENV MCP_GROUP_BROWSER=true
ENV MCP_GROUP_NEURAL=true
ENV MCP_GROUP_AGENTIC_FLOW=true
ENV MCP_GROUP_CLAUDE_CODE=false
ENV MCP_GROUP_GEMINI=true
ENV MCP_GROUP_CODEX=true

CMD ["node", "index.js"]
