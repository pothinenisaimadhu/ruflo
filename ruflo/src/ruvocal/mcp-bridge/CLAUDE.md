# Claude Code Project Configuration

## RuVector Self-Learning Intelligence v2.0

This project uses RuVector's self-learning intelligence hooks with advanced capabilities:
- **Q-learning** for agent routing optimization
- **Vector memory** with HNSW indexing (150x faster search)
- **AST parsing** for code complexity analysis
- **Diff embeddings** for change classification and risk scoring
- **Coverage routing** for test-aware agent selection
- **Graph algorithms** for code structure analysis
- **Security scanning** for vulnerability detection
- **10 attention mechanisms** including hyperbolic and graph attention

### Active Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| **PreToolUse** | Before Edit/Write/Bash | Agent routing, AST analysis, command risk assessment |
| **PostToolUse** | After Edit/Write/Bash | Q-learning update, diff embeddings, outcome tracking |
| **SessionStart** | Conversation begins | Load intelligence state, display learning stats |
| **Stop** | Conversation ends | Save learning data, export metrics |
| **UserPromptSubmit** | User sends message | RAG context suggestions, pattern recommendations |
| **PreCompact** | Before context compaction | Preserve important context and memories |
| **Notification** | Any notification | Track events for learning |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RUVECTOR_INTELLIGENCE_ENABLED` | `true` | Enable/disable intelligence layer |
| `RUVECTOR_LEARNING_RATE` | `0.1` | Q-learning rate (0.0-1.0) |
| `RUVECTOR_MEMORY_BACKEND` | `rvlite` | Memory storage backend |
| `INTELLIGENCE_MODE` | `treatment` | A/B testing mode (treatment/control) |
| `RUVECTOR_AST_ENABLED` | `true` | Enable AST parsing and complexity analysis |
| `RUVECTOR_DIFF_EMBEDDINGS` | `true` | Enable diff embeddings and risk scoring |
| `RUVECTOR_COVERAGE_ROUTING` | `true` | Enable test coverage-aware routing |
| `RUVECTOR_GRAPH_ALGORITHMS` | `true` | Enable graph algorithms (MinCut, Louvain) |
| `RUVECTOR_SECURITY_SCAN` | `true` | Enable security vulnerability scanning |

### Core Commands

```bash
# Initialize hooks in a project
npx ruvector hooks init

# View learning statistics
npx ruvector hooks stats

# Route a task to best agent
npx ruvector hooks route "implement feature X"

# Enhanced routing with AST/coverage/diff signals
npx ruvector hooks route-enhanced "fix bug" --file src/api.ts

# Store context in vector memory
npx ruvector hooks remember "important context" -t project

# Recall from memory (semantic search)
npx ruvector hooks recall "context query"
```

### AST Analysis Commands

```bash
# Analyze file structure, symbols, imports, complexity
npx ruvector hooks ast-analyze src/index.ts

# Get complexity metrics for multiple files
npx ruvector hooks ast-complexity src/*.ts --threshold 15
```

### Diff & Risk Analysis Commands

```bash
# Analyze commit with semantic embeddings and risk scoring
npx ruvector hooks diff-analyze HEAD

# Classify change type (feature, bugfix, refactor, etc.)
npx ruvector hooks diff-classify

# Find similar past commits
npx ruvector hooks diff-similar -k 5

# Get risk score only
npx ruvector hooks diff-analyze --risk-only
```

### Coverage & Testing Commands

```bash
# Get coverage-aware routing for a file
npx ruvector hooks coverage-route src/api.ts

# Suggest tests for files based on coverage
npx ruvector hooks coverage-suggest src/*.ts
```

### Graph Analysis Commands

```bash
# Find optimal code boundaries (MinCut algorithm)
npx ruvector hooks graph-mincut src/*.ts

# Detect code communities (Louvain/Spectral clustering)
npx ruvector hooks graph-cluster src/*.ts --method louvain
```

### Security & RAG Commands

```bash
# Parallel security vulnerability scan
npx ruvector hooks security-scan src/*.ts

# RAG-enhanced context retrieval
npx ruvector hooks rag-context "how does auth work"

# Git churn analysis (hot spots)
npx ruvector hooks git-churn --days 30
```

### MCP Tools (via Claude Code)

When using the RuVector MCP server, these tools are available:

| Tool | Description |
|------|-------------|
| `hooks_stats` | Get intelligence statistics |
| `hooks_route` | Route task to best agent |
| `hooks_route_enhanced` | Enhanced routing with AST/coverage signals |
| `hooks_remember` / `hooks_recall` | Vector memory operations |
| `hooks_ast_analyze` | Parse AST and extract symbols |
| `hooks_ast_complexity` | Get complexity metrics |
| `hooks_diff_analyze` | Analyze changes with embeddings |
| `hooks_diff_classify` | Classify change types |
| `hooks_coverage_route` | Coverage-aware routing |
| `hooks_coverage_suggest` | Suggest needed tests |
| `hooks_graph_mincut` | Find code boundaries |
| `hooks_graph_cluster` | Detect communities |
| `hooks_security_scan` | Security vulnerability scan |
| `hooks_rag_context` | RAG context retrieval |
| `hooks_git_churn` | Hot spot analysis |
| `hooks_attention_info` | Available attention mechanisms |
| `hooks_gnn_info` | GNN layer capabilities |

### Attention Mechanisms

RuVector includes 10 attention mechanisms:

1. **DotProductAttention** - Scaled dot-product attention
2. **MultiHeadAttention** - Parallel attention heads
3. **FlashAttention** - Memory-efficient tiled attention
4. **HyperbolicAttention** - Poincaré ball hyperbolic space
5. **LinearAttention** - O(n) linear complexity
6. **MoEAttention** - Mixture-of-Experts sparse attention
7. **GraphRoPeAttention** - Rotary position for graphs
8. **EdgeFeaturedAttention** - Edge-aware graph attention
9. **DualSpaceAttention** - Euclidean + Hyperbolic hybrid
10. **LocalGlobalAttention** - Sliding window + global tokens

### How It Works

1. **Pre-edit hooks** analyze files via AST and suggest agents based on Q-learned patterns
2. **Post-edit hooks** generate diff embeddings to improve future routing
3. **Coverage routing** adjusts agent weights based on test coverage
4. **Graph algorithms** detect code communities for module boundaries
5. **Security scanning** identifies common vulnerability patterns
6. **RAG context** retrieves relevant memories using HNSW search
7. **Attention mechanisms** provide advanced embedding transformations

### Learning Data

Stored in `.ruvector/intelligence.json`:
- **Q-table patterns**: State-action values for agent routing
- **Vector memories**: ONNX embeddings with HNSW indexing
- **Trajectories**: SONA trajectory tracking for meta-learning
- **Co-edit patterns**: File relationship graphs
- **Error patterns**: Known issues and suggested fixes
- **Diff embeddings**: Change classification patterns

### Init Options

```bash
npx ruvector hooks init              # Full configuration with all capabilities
npx ruvector hooks init --minimal    # Basic hooks only
npx ruvector hooks init --fast       # Use fast local wrapper (20x faster)
npx ruvector hooks init --pretrain   # Initialize + pretrain from git history
npx ruvector hooks init --build-agents quality  # Generate optimized agents
npx ruvector hooks init --force      # Overwrite existing configuration
```

---
*Powered by [RuVector](https://github.com/ruvnet/ruvector) self-learning intelligence v2.0*
