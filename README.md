# dotcontext

Structured, machine-readable documentation for every directory in your codebase. One `.context.yaml` per folder. Any LLM can read it.

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
  - name: schema.ts
    purpose: Zod schemas for .context.yaml and .context.config.yaml
  - name: writer.ts
    purpose: YAML read/write with schema validation
interfaces:
  - name: scanProject(rootPath, options)
    description: Walk directory tree, return ScanResult with files and children
  - name: checkFreshness(dirPath, storedFingerprint)
    description: Compare stored vs computed fingerprint, return fresh/stale/missing
dependencies:
  internal:
    - ../utils/ignore
  external:
    - yaml ^2.8
    - zod ^4.3
```

## Why

Every LLM coding tool — Claude Code, Cursor, Copilot, Windsurf, Aider — has the same problem: to understand a directory, it reads every file. This wastes tokens, doesn't scale, and means different LLMs working on the same project build no shared understanding of what the code does.

`.context.yaml` files fix this. Structured documentation at each level of the directory tree. An LLM reads one file and knows what the directory contains, what the key files do, what the public interfaces are, and what decisions were made — without opening a single source file.

> **Key distinction**: `CLAUDE.md`, `.cursorrules`, and `copilot-instructions.md` are *behavioral instructions* ("how should the AI behave"). `.context.yaml` files are *factual documentation* ("what does this code do"). They're complementary — use both.

## Quick Start

```bash
npm install -g dotcontext

context init                # Generate .context.yaml files (static analysis, no API key)
context status              # Check which files are fresh/stale
context validate            # Schema compliance check
context show src/core       # Pretty-print a context file
```

Requires Node.js >= 18. No accounts, no cloud services, works fully offline.

## What It Generates

Every `.context.yaml` follows a strict schema. Required fields are always present; optional fields appear when there's something meaningful to document.

```yaml
# ---- Required ----
version: 1
last_updated: "2026-02-10T14:30:00Z"
fingerprint: "a3f8b2c1"           # 8-char SHA-256 of directory contents
scope: "src/auth"                  # relative path from project root
summary: |
  Handles user authentication and session management.
  JWT-based with access/refresh token pairs.

files:
  - name: "handler.py"
    purpose: "FastAPI route handlers for /login, /register, /refresh"
  - name: "tokens.py"
    purpose: "JWT creation, validation, and expiry logic"
  - name: "middleware.py"
    purpose: "Auth middleware for protected routes"
    test_file: "tests/test_middleware.py"

maintenance: |
  If you modify files in this directory, update this .context.yaml.
  Do not include secrets, API keys, passwords, or PII in this file.

# ---- Optional ----
interfaces:
  - name: "POST /login"
    description: "Authenticates user, returns JWT token pair"
  - name: "verifyToken(token): User"
    description: "Validates JWT and returns decoded user"

decisions:
  - what: "JWT over server-side sessions"
    why: "Stateless, scales horizontally"
    tradeoff: "Revocation requires a blocklist table"

constraints:
  - "All endpoints except /health require authentication"

dependencies:
  internal:
    - "src/db — database models and connection"
  external:
    - "pyjwt ^2.8"
    - "fastapi ^0.110"

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

# ---- Root-only (scope: ".") ----
project:
  name: "myapp"
  description: "REST API for task management"
  language: "python"
  framework: "fastapi"
  package_manager: "pip"

structure:
  - path: "src/auth"
    summary: "Authentication and JWT handling"
  - path: "src/api"
    summary: "REST endpoint handlers"
  - path: "src/db"
    summary: "SQLAlchemy models and migrations"

# ---- Machine-derived ----
derived_fields:
  - "dependencies.external"
  - "files[].test_file"
  - "evidence"

evidence:
  collected_at: "2026-02-10T14:30:00Z"
  test_status: "passing"
  test_count: 142
```

### Schema Reference

| Field | Required | Description |
|---|---|---|
| `version` | yes | Schema version (always `1`) |
| `last_updated` | yes | ISO 8601 timestamp |
| `fingerprint` | yes | 8-char hex hash of directory contents |
| `scope` | yes | Relative path from project root |
| `summary` | yes | 1-3 sentence description |
| `files` | yes | Every source file with `name` and `purpose` |
| `maintenance` | yes | Self-describing update instruction for LLMs |
| `interfaces` | no | Public APIs, functions, CLI commands, endpoints |
| `decisions` | no | Architectural choices (what/why/tradeoff) |
| `constraints` | no | Hard rules the code must follow |
| `dependencies` | no | Internal modules and external packages |
| `current_state` | no | What's working, broken, or in progress |
| `subdirectories` | no | Child directories with summaries |
| `environment` | no | Required env vars |
| `testing` | no | Test commands and conventions |
| `todos` | no | Known future improvements |
| `data_models` | no | Key data structures |
| `events` | no | Events emitted or consumed |
| `config` | no | Config files or feature flags |
| `project` | root only | Project metadata (name, language, framework) |
| `structure` | root only | Top-level directory map |
| `derived_fields` | no | Machine-generated field paths (provenance tracking) |
| `evidence` | no | Test/typecheck results from existing artifacts |

## Commands

### Generate

| Command | Description |
|---|---|
| `context init` | Scan project and generate all `.context.yaml` files |
| `context init --llm` | Use LLM provider for richer context (summaries, decisions, constraints) |
| `context init --llm --evidence` | Also collect test/typecheck evidence from artifacts |
| `context regen src/core` | Regenerate context for a specific directory |
| `context regen --all` | Regenerate all directories |
| `context regen --all --no-llm` | Regenerate all using static analysis only |

### Maintain

| Command | Description |
|---|---|
| `context status` | Check freshness of all `.context.yaml` files |
| `context rehash` | Recompute fingerprints without regenerating content |
| `context validate` | Check schema compliance |
| `context validate --strict` | Cross-reference context against actual source code |
| `context watch` | Watch for changes, report staleness in real-time |
| `context watch --interval 200` | Custom debounce interval (default: 500ms) |

### Query

| Command | Description |
|---|---|
| `context show <path>` | Pretty-print a `.context.yaml` file |
| `context serve` | Start MCP server (stdio transport) |

### Configure

| Command | Description |
|---|---|
| `context config` | View current configuration |
| `context config --provider anthropic` | Set LLM provider |
| `context config --model gpt-4o --provider openai` | Set provider and model |
| `context config --ignore dist --ignore tmp` | Add directories to ignore list |
| `context config --max-depth 3` | Limit scanning depth |
| `context config --api-key-env MY_KEY` | Set custom env var for API key |
| `context ignore vendor` | Add directory to `.contextignore` |

All commands accept `-p, --path <path>` to target a specific project root.

## Generation Modes

### Static Analysis (default)

No API key needed. Works offline. Produces:

- File listings with auto-detected purposes
- **AST-based export detection** via tree-sitter (TypeScript, JavaScript, Python, Go, Rust)
- **External dependencies** parsed from package.json, requirements.txt, Cargo.toml, go.mod
- **Internal module dependencies** from import/require statements
- **Test evidence** from existing test result artifacts (never runs commands)
- Project metadata and directory structure at root level
- Machine-derived fields tracked in `derived_fields` for provenance

```bash
context init                   # static analysis
context regen --all --no-llm   # regenerate without LLM
```

### LLM-Enhanced

Sends file contents to a configured provider. Produces everything static analysis does, plus:

- Rich narrative summaries
- Interface descriptions
- Architectural decisions with tradeoffs
- Constraints and current state
- Machine-detected fields (deps, evidence) overlaid on top for accuracy

```bash
context init --llm                 # interactive provider selection
context init --llm --evidence      # also collect test artifacts
context regen src/core             # regen single dir with configured provider
```

## MCP Server

The MCP server exposes `.context.yaml` data to LLM clients via the [Model Context Protocol](https://modelcontextprotocol.io). Three tools:

### Tools

**`query_context`** — Retrieve context for a directory scope, optionally filtering to specific fields.

```json
// Input
{ "scope": "src/core", "filter": ["summary", "interfaces"] }

// Output
{
  "found": true,
  "scope": "src/core",
  "context": {
    "version": 1,
    "scope": "src/core",
    "fingerprint": "a3f8b2c1",
    "last_updated": "2026-02-10T14:30:00Z",
    "summary": "Core scanning, fingerprinting, and schema validation.",
    "interfaces": [
      { "name": "scanProject(rootPath, options)", "description": "Walk directory tree" }
    ]
  }
}
```

Metadata fields (`version`, `scope`, `fingerprint`, `last_updated`) are always included. Filterable fields: `summary`, `files`, `interfaces`, `decisions`, `constraints`, `dependencies`, `current_state`, `subdirectories`, `environment`, `testing`, `todos`, `data_models`, `events`, `config`, `project`, `structure`, `maintenance`.

**`check_freshness`** — Check if a context file is current.

```json
// Input
{ "scope": "src/core" }

// Output
{
  "scope": "src/core",
  "state": "stale",
  "fingerprint": { "stored": "a3f8b2c1", "computed": "f7e2d9a0" },
  "last_updated": "2026-02-10T14:30:00Z"
}
```

**`list_contexts`** — List all directories with staleness status.

```json
// Output
{
  "root": "/path/to/project",
  "total_directories": 6,
  "tracked": 6,
  "entries": [
    { "scope": ".", "state": "fresh", "has_context": true, "summary": "Project root..." },
    { "scope": "src/core", "state": "stale", "has_context": true, "summary": "Core modules..." },
    { "scope": "src/commands", "state": "fresh", "has_context": true, "summary": "CLI commands..." }
  ]
}
```

### Setup

**Claude Code:**

```bash
claude mcp add dotcontext -- context serve --path /path/to/project
```

**Cursor** — add to `.cursor/mcp.json`:

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

**Any MCP client** — the server uses stdio transport:

```bash
context serve --path /path/to/project
```

## What It Detects

### Languages (30+)

TypeScript, JavaScript, Python, Rust, Go, Java, Kotlin, C, C++, C#, Ruby, PHP, Swift, Scala, Elixir, Haskell, Lua, R, SQL, Shell, Vue, Svelte, Terraform, GraphQL, Protocol Buffers, and more.

### AST-Based Export Detection

Uses [tree-sitter](https://tree-sitter.github.io/) for accurate export extraction:

| Language | What it finds |
|---|---|
| TypeScript/JavaScript | `export function`, `export class`, `export type`, `export interface`, re-exports |
| Python | Top-level `def`, `class`, `async def` (filters out `_private` names) |
| Go | Capitalized functions, types, methods, constants |
| Rust | `pub fn`, `pub struct`, `pub enum`, `pub trait`, `pub type` |

### Dependency Detection

| Source | What it reads |
|---|---|
| `package.json` | `dependencies` + `devDependencies` (marks dev deps) |
| `requirements.txt` | Python packages with versions |
| `Cargo.toml` | Rust crates from `[dependencies]` and `[dev-dependencies]` |
| `go.mod` | Go module requires |

Falls through multiple manifests — an empty `package.json` won't prevent detection of `requirements.txt` in the same directory.

### Evidence Collection

Reads existing test result artifacts — **never runs commands**:

| Artifact | What it extracts |
|---|---|
| `test-results.json` | test_status, test_count, failing_tests (Jest/Vitest format) |
| `.vitest-results.json` | Same as above |
| `junit.xml` | Parsed from JUnit XML format |

Evidence is root-only and opt-in (`--evidence` flag).

## Validation

### Standard (`context validate`)

- YAML syntax check
- Schema compliance (Zod validation)

### Strict (`context validate --strict`)

Cross-references `.context.yaml` against actual source code:

| Check | What it catches |
|---|---|
| **Phantom files** | Listed in context but missing from disk |
| **Unlisted files** | On disk but not listed in context |
| **Phantom interfaces** | Declared but not found in code exports |
| **Dependency mismatches** | Declared internal deps not found in imports, undeclared deps found in imports |

```
$ context validate --strict
  src/core/
    ⚠ phantom file: deleted-module.ts (listed but not found)
    ⚠ unlisted file: new-helper.ts (found but not listed)
    ⚠ phantom interface: oldFunction (declared but not found in code)
  strict: 3 warnings, 0 info
```

## Configuration

Provider settings live in `.context.config.yaml` (add to `.gitignore`):

```yaml
provider: anthropic
model: claude-sonnet-4-5-20250929   # optional model override
api_key_env: MY_CUSTOM_KEY          # optional env var name
ignore:                             # additional directories to ignore
  - tmp
  - scratch
max_depth: 5                        # max directory scan depth
```

### Providers

| Provider | Default Model | Env Var | Notes |
|---|---|---|---|
| Anthropic | claude-sonnet-4-5-20250929 | `ANTHROPIC_API_KEY` | |
| OpenAI | gpt-4o | `OPENAI_API_KEY` | |
| Google | gemini-2.0-flash | `GOOGLE_API_KEY` | Direct REST API (no SDK) |
| Ollama | llama3.1 | `OLLAMA_HOST` | Local, no API key needed |

```bash
export ANTHROPIC_API_KEY=sk-ant-...    # or set via context config --api-key-env
context init --llm                      # interactive provider selection
```

## How It Works

### Scanning

`context init` walks the directory tree, finding directories with source files. Automatically skips `node_modules`, `.git`, `dist`, `build`, `.next`, `__pycache__`, `target`, `vendor`, and 15+ other non-source directories. Supports common ignore patterns from `.gitignore` and `.contextignore` (exact directory names, path rules like `src/generated`, and glob rules like `packages/*/dist`).

### Fingerprinting

Each directory gets an 8-character SHA-256 fingerprint computed from sorted `filename:mtime:size` entries. This is cheap — only `stat()` calls, no file reads — and detects when any file in a directory has been added, removed, or modified.

### Staleness

| State | Meaning |
|---|---|
| **fresh** | Stored fingerprint matches computed. Context is current. |
| **stale** | Fingerprints differ. Files changed since last update. |
| **missing** | No `.context.yaml` exists for this directory. |

`context status` checks all directories. `context watch` monitors in real-time with debounced per-directory checks.

### Self-Maintenance

Every `.context.yaml` contains a `maintenance` field with instructions for LLMs. When an LLM reads a context file and then modifies source files in that directory, the maintenance instruction tells it to update the context. This works across all LLM tools — the instructions are embedded in the file itself.

### Ignored Directories

Three layers of ignore rules:

1. **Built-in**: `node_modules`, `.git`, `dist`, `build`, etc. (always ignored)
2. **`.gitignore`**: Common directory/path/glob patterns are respected
3. **`.contextignore`**: Project-specific exclusions with the same pattern support (`context ignore <path>`)
4. **Config**: `context config --ignore <dir>` adds to `.context.config.yaml`

## License

MIT
