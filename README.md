# dotcontext

Every coding agent gets the same repo-native context via `.context.yaml` — portable across tools, git-visible, local-first.

```
$ context init
Scanning project...
  ✓ .                    (12 files)
  ✓ src/                 (8 files)
  ✓ src/core/            (5 files)
  ✓ src/commands/        (9 files)
  ✓ src/generator/       (6 files)
  ✓ tests/               (4 files)
Done. 6 .context.yaml files created.

$ context status
  ✓ .                  fresh
  ✓ src/               fresh
  ⚠ src/core/          stale (3 files changed)
  ✓ src/commands/      fresh
  ✓ src/generator/     fresh
  ✓ tests/             fresh

$ context show src/core
scope: src/core
summary: |
  Core scanning, fingerprinting, and schema validation.
  Handles directory tree traversal and content-hash based staleness detection.
files:
  - name: scanner.ts
    purpose: Recursive directory walker with gitignore/contextignore support
  - name: fingerprint.ts
    purpose: SHA-256 content hashing for staleness detection
interfaces:
  - name: scanProject(rootPath, options)
    description: Walk directory tree, return ScanResult with files and children
  - name: checkFreshness(dirPath, storedFingerprint)
    description: Compare stored vs computed fingerprint, return fresh/stale/missing
dependencies:
  external:
    - yaml ^2.8
    - zod ^4.3
```

## Why

Every LLM coding tool — Claude Code, Cursor, Copilot, Windsurf, Aider — has the same problem: to understand a directory, it reads every file. This wastes tokens, doesn't scale, and means different LLMs working on the same project build no shared understanding of what the code does.

`.context.yaml` files fix this. Structured documentation at each level of the directory tree. An LLM reads one file and knows what the directory contains, what the key files do, what the public interfaces are, and what decisions were made — without opening a single source file.

## Core Features

- **Schema validation** — `.context.yaml` files are validated against a strict schema for consistent, machine-readable structure.
- **MCP queryability** — LLM clients can query context through MCP tools instead of scraping text.
- **Field filtering** — `query_context` can return only selected fields (for example `interfaces` or `dependencies`) to reduce token usage.
- **Fingerprint-based freshness** — each directory has a content fingerprint with `fresh`, `stale`, and `missing` state tracking.
- **`derived_fields` provenance tracking** — machine-derived fields are explicitly marked so agents can distinguish high-confidence facts from narrative.
- **Strict cross-check validation** — `context validate --strict` can detect drift between declared context and actual code.

## How It Compares

| Capability | dotcontext | CLAUDE.md / .cursorrules | Tool-native indexes | Memory tools |
|---|---|---|---|---|
| What it stores | Factual docs (what code does) | Behavioral rules (how AI acts) | Embeddings / vectors | Conversation history |
| Portable across tools | Yes — plain YAML in git | No — tool-specific | No — proprietary | No — tied to service |
| Git-visible | Yes — committed, diffable | Yes | No | No |
| Works offline | Yes — static analysis default | Yes | Depends | No |
| Machine-queryable | Yes — MCP + schema | No — unstructured | Partial | Partial |
| Staleness detection | Yes — fingerprint-based | No | Varies | N/A |
| Self-maintaining | Yes — embedded instructions | No | Auto-updated | Auto-updated |

**dotcontext is not:**
- An agent framework (no tool calling, no execution)
- A vector database (no embeddings, no semantic search)
- Behavioral rules (that's what CLAUDE.md is for)
- A cloud service (everything local, data stays on disk)

## Quick Start

```bash
npm install -g dotcontext

context init                # Generate .context.yaml files (static analysis, no API key)
context status              # Check which files are fresh/stale
context validate            # Schema compliance check
context show src/core       # Pretty-print a context file
```

Requires Node.js >= 18. No accounts, no cloud services, works fully offline. See [docs/quickstart.md](docs/quickstart.md) for the full 5-minute guide.

## Commands

| Command | Description |
|---|---|
| `context init` | Scan project, generate all `.context.yaml` files |
| `context init --llm` | Use LLM for richer summaries, decisions, constraints |
| `context init --llm --evidence` | Also collect test evidence from artifacts |
| `context status` | Check freshness of all context files |
| `context regen [path]` | Regenerate context for a specific directory (or `--all`) |
| `context rehash` | Recompute fingerprints without regenerating content |
| `context validate` | Schema compliance check |
| `context validate --strict` | Cross-reference against actual source code |
| `context watch` | Real-time staleness monitoring |
| `context show <path>` | Pretty-print a context file |
| `context config` | View/edit provider settings |
| `context ignore <path>` | Add directory to `.contextignore` |
| `context serve` | Start MCP server for LLM tool integration |

All commands accept `-p, --path <path>` to target a specific project root.

## Generation Modes

**Static analysis** (default) — no API key, works offline:
- File listings with auto-detected purposes
- AST-based export detection via tree-sitter (TypeScript, JavaScript, Python, Go, Rust)
- Dependencies from package.json, requirements.txt, Cargo.toml, go.mod
- Internal module dependencies from import statements
- Test evidence from existing artifacts (opt-in, `--evidence`)

**LLM-enhanced** (`--llm`) — richer output via configured provider:
- Everything static analysis produces, plus rich summaries, interface descriptions, architectural decisions, constraints, current state
- Machine-derived fields always overlay LLM output for accuracy

## MCP Server

Three tools via [Model Context Protocol](https://modelcontextprotocol.io) (stdio transport):

- **`query_context`** — Retrieve context for a directory, with optional field filtering
- **`check_freshness`** — Check if context is fresh, stale, or missing
- **`list_contexts`** — List all directories with staleness status

```bash
# Claude Code
claude mcp add dotcontext -- context serve --path /path/to/project

# Cursor (.cursor/mcp.json)
{ "mcpServers": { "dotcontext": { "command": "context", "args": ["serve", "--path", "."] } } }
```

See [docs/integrations.md](docs/integrations.md) for Windsurf, Continue, generic MCP clients, non-MCP usage, and CI/CD setup.

## Configuration

```yaml
# .context.config.yaml (add to .gitignore)
provider: anthropic
model: claude-3-5-haiku-latest
ignore: [tmp, scratch]
max_depth: 5
```

| Provider | Default Model | Env Var |
|---|---|---|
| Anthropic | claude-3-5-haiku-latest | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-4o-mini | `OPENAI_API_KEY` |
| Google | gemini-2.0-flash-lite | `GOOGLE_API_KEY` |
| Ollama | llama3.2:3b | `OLLAMA_HOST` (local, no key) |

## How It Works

**Scanning** — walks the directory tree, finds directories with source files. Skips `node_modules`, `.git`, `dist`, `build`, and 15+ other non-source directories. Respects `.gitignore` and `.contextignore` patterns (exact names, globs, path rules, negation).

**Fingerprinting** — 8-char SHA-256 from sorted `filename:mtime:size`. Cheap (`stat()` only, no file reads). Detects additions, deletions, and modifications.

**Staleness** — `fresh` (fingerprint matches), `stale` (files changed), `missing` (no context file). `context status` checks all; `context watch` monitors live.

**Self-maintenance** — every `.context.yaml` embeds a `maintenance` field instructing LLMs to update it after modifying files. Works across all tools.

## Documentation

| Doc | What it covers |
|---|---|
| [Quickstart](docs/quickstart.md) | Install to MCP in 5 minutes |
| [Schema Reference](docs/schema.md) | Full `.context.yaml` field reference with examples |
| [Trust Model](docs/trust-model.md) | Machine-derived vs LLM-generated fields, freshness guarantees |
| [Validation](docs/validation.md) | Standard and strict mode semantics |
| [Integrations](docs/integrations.md) | Claude Code, Cursor, Windsurf, Continue, non-MCP, CI/CD |
| [CI/CD Guide](docs/ci.md) | GitHub Actions, GitLab CI, fail policies |
| [Troubleshooting](docs/troubleshooting.md) | Common issues with fixes |
| [Limitations](docs/limitations.md) | What dotcontext does not guarantee |

## License

MIT
