# dotcontext

Folder-level documentation for LLMs — `.context.yaml` files for every directory.

## What is this?

Every LLM coding tool (Claude Code, Cursor, Copilot, Windsurf, Aider) suffers from the same problem: when an LLM needs to understand a directory, it must read every file. This doesn't scale, wastes tokens, and means different LLMs working on the same project have no shared understanding of what the code does.

`.context.yaml` files solve this by placing structured, machine-readable documentation at each meaningful level of the directory tree. Any LLM can read a `.context.yaml` to understand what a directory contains, what the key files do, what the public interfaces are, and what decisions were made — without opening a single source file.

**Key distinction**: `CLAUDE.md`, `.cursorrules`, and `copilot-instructions.md` are *behavioral instructions* ("how should the AI behave"). `.context.yaml` files are *factual documentation* ("what does this code do"). These are complementary.

## Quick Start

```bash
# Install
npm install -g dotcontext

# Generate context files (no API key needed)
context init --no-llm

# Check freshness
context status

# Validate all context files
context validate

# View a specific context file
context show src/core
```

## Installation

```bash
npm install -g dotcontext
```

Requires Node.js >= 18. No accounts, no login, no cloud service.

## Commands

| Command | Description |
|---|---|
| `context init` | Scan project, generate all `.context.yaml` files |
| `context status` | Check freshness of all `.context.yaml` files |
| `context regen [path]` | Regenerate `.context.yaml` for a specific directory |
| `context rehash` | Recompute fingerprints without regenerating content |
| `context validate` | Check all `.context.yaml` files for schema compliance |
| `context show <path>` | Pretty-print a `.context.yaml` file |
| `context config` | View/edit provider settings |
| `context ignore <path>` | Add a directory to `.contextignore` |
| `context serve` | Start MCP server for LLM tool integration |

### Key flags

```bash
context init --no-llm          # Static analysis only (no API key needed)
context init                   # Interactive: choose provider, enter API key
context regen src/core         # Regenerate a specific directory
context regen --all            # Regenerate everything
context regen --all --no-llm   # Regenerate everything without LLM
context serve --path /my/project  # Start MCP server for a specific project
```

## `.context.yaml` Schema

Every `.context.yaml` file has this structure:

```yaml
# --- Required fields ---
version: 1
last_updated: "2026-02-10T14:30:00Z"
fingerprint: "a3f8b2c1"
scope: "src/auth/"
summary: |
  Handles user authentication and session management.
  JWT-based with access/refresh token pairs.

files:
  - name: "handler.py"
    purpose: "FastAPI route handlers for /login, /register, /refresh"
  - name: "tokens.py"
    purpose: "JWT creation, validation, and expiry logic"

maintenance: |
  If you modify files in this directory, update this .context.yaml.
  Do not include secrets, API keys, passwords, or PII in this file.

# --- Optional fields ---
interfaces:
  - name: "POST /login"
    description: "Authenticates user, returns JWT tokens"

decisions:
  - what: "JWT over server-side sessions"
    why: "Stateless, scales horizontally"
    tradeoff: "Revocation requires a blocklist table"

constraints:
  - "All endpoints except /health require authentication"

dependencies:
  internal:
    - "src/db/ — database models and connection"
  external:
    - "pyjwt ^2.8"

current_state:
  working:
    - "Login and register endpoints fully tested"
  broken:
    - "Refresh endpoint has race condition (#14)"
  in_progress:
    - "Adding rate limiting to login endpoint"

subdirectories:
  - name: "tests/"
    summary: "Unit and integration tests for auth module"
```

### Required fields

| Field | Type | Description |
|---|---|---|
| `version` | integer | Schema version (always `1`) |
| `last_updated` | string | ISO 8601 timestamp |
| `fingerprint` | string | 8-char hex hash of directory contents |
| `scope` | string | Relative path from project root |
| `summary` | string | 1-3 sentence description |
| `files` | array | Every file with `name` and `purpose` |
| `maintenance` | string | Self-describing update instruction for LLMs |

### Optional fields

| Field | When to use |
|---|---|
| `interfaces` | Public APIs, functions, CLI commands, endpoints |
| `decisions` | Non-obvious architectural choices (what/why/tradeoff) |
| `constraints` | Hard rules the code must follow |
| `dependencies` | Internal modules and external packages |
| `current_state` | What's working, broken, or in progress |
| `subdirectories` | Child directories with their own context files |
| `environment` | Required env vars or config |
| `testing` | Test commands and conventions |
| `todos` | Known future improvements |
| `data_models` | Key data structures or schemas |
| `events` | Events emitted or consumed |
| `config` | Config files or feature flags |

### Root-only fields

The root `.context.yaml` (scope `.`) can additionally include:

- **`project`**: `name`, `description`, `language`, `framework`, `package_manager`
- **`structure`**: Array of `{path, summary}` for top-level directories

## Configuration

Provider settings are stored in `.context.config.yaml` (gitignored):

```yaml
provider: anthropic       # anthropic | openai | google | ollama
model: claude-sonnet-4-5-20250929  # optional model override
api_key_env: MY_KEY       # optional env var name for API key
ignore:                   # additional directories to ignore
  - tmp
max_depth: 5              # max directory scan depth
```

### API keys

Set API keys via environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
```

Or enter them interactively during `context init`.

### Supported providers

| Provider | Default model | Env var |
|---|---|---|
| Anthropic | claude-sonnet-4-5-20250929 | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-4o | `OPENAI_API_KEY` |
| Google | gemini-2.0-flash | `GOOGLE_API_KEY` |
| Ollama | llama3.1 | (none, local) |

## MCP Server

The MCP server exposes `.context.yaml` data to LLM clients via the Model Context Protocol. Three tools:

- **`query_context`** — Retrieve context for a directory, optionally filtering to specific fields
- **`check_freshness`** — Check if context is fresh, stale, or missing
- **`list_contexts`** — List all directories with their staleness status

### Claude Code

```bash
claude mcp add dotcontext -- context serve --path /path/to/project
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dotcontext": {
      "command": "context",
      "args": ["serve", "--path", "/path/to/project"]
    }
  }
}
```

## How It Works

### Scanning

`context init` walks the directory tree, finding directories with source files. It skips `node_modules`, `.git`, `dist`, `build`, and other common non-source directories. Respects `.gitignore` and `.contextignore`.

### Fingerprinting

Each directory gets a fingerprint — the first 8 characters of a SHA-256 hash computed from the sorted list of `filename:mtime:size` entries. This is cheap (only `stat()` calls, no file reads) and detects when files have changed since the context was last updated.

### Staleness detection

- **fresh**: Stored fingerprint matches computed fingerprint
- **stale**: Fingerprints don't match (files changed since last update)
- **missing**: No `.context.yaml` exists

### Generation modes

- **`--no-llm`** (default for `init`): Static analysis only. Generates file listings, detected exports, and structural information. No API key needed, works offline.
- **With LLM**: Sends file contents to the configured provider for rich summaries, interface descriptions, and architectural decisions.

### Self-maintaining

Every `.context.yaml` contains a `maintenance` field with instructions for LLMs. When an LLM reads a `.context.yaml` and then modifies files in that directory, the maintenance instruction tells it to update the context file. This works across all LLM tools — the instructions are in the file itself.

## License

MIT
