# context — Folder-Level Documentation for LLMs

## Context

Every LLM coding tool today (Claude Code, Cursor, Copilot, Windsurf, Aider) suffers from the same problem: when an LLM needs to understand a directory, it must read every file. This doesn't scale, wastes tokens, and means different LLMs working on the same project have no shared understanding of what the code does.

`.context.yaml` files solve this by placing structured, machine-readable documentation at each meaningful level of the directory tree. Any LLM can read a `.context.yaml` to understand what a directory contains, what the key files do, what the public interfaces are, and what decisions were made — without opening a single source file.

**Key distinction from existing tools**: CLAUDE.md, .cursorrules, copilot-instructions.md are *behavioral instructions* ("how should the AI behave"). `.context.yaml` files are *factual documentation* ("what does this code do"). These are complementary.

### Why this matters despite existing tools

**The demand is validated**: 65% of devs say AI misses context; 26% of improvement requests focus on context (Qodo 2025). $500M+ raised by startups solving this (Augment, Greptile, Sourcegraph, Qodo).

**Prior art failed on execution, not concept**: The Codebase Context Specification (Agentic-Insights) tried this and was archived at 137 stars in Oct 2025. Their `dotcontext` npm package (5 stars) is dead. Their execution was weak — our plan is substantially better engineered (fingerprinting, schema validation, LLM generation, staleness detection).

**Native tool indexing is proprietary and non-portable**: Cursor's embeddings only help in Cursor. Copilot's index only helps in Copilot. `.context.yaml` files persist in the repo and work across all tools.

### Key positioning decisions (from research)

1. **Complement AGENTS.md, don't compete** — AGENTS.md (60K+ repos, Linux Foundation AAIF) tells AI how to behave. `.context.yaml` tells AI what the code does. Explicitly complementary.
2. **Ship MCP server on day one** — MCP is the standard protocol (Linux Foundation, 10K+ servers). An MCP server makes `.context.yaml` instantly useful in Claude Code, Cursor, etc.
3. **Lead with `--no-llm` mode** — Zero-dependency structural analysis is the adoption wedge. Try it in 30 seconds, no API key.
4. **npm name**: `dotcontext` is taken (archived). Use `@dotcontext/cli` (scoped) or `contextdot`. Decision needed.

### Product principles

1. **Local-first by default** — all data stays on disk, no cloud dependency
2. **Repo-native and git-diff-friendly** — `.context.yaml` files are committed documentation
3. **LLM-agnostic** — works without any single vendor; self-describing files readable by any model
4. **Deterministic where possible** — `--no-llm` mode, schema validation, and fingerprints provide ground truth without LLM involvement
5. **Progressive enhancement** — static analysis first, LLM generation second, MCP assistive layer alongside

---

## 1. Format Decision: YAML

**Choice: Pure YAML (`.context.yaml`)**

| Criterion | YAML | Markdown+Frontmatter | Markdown-only | JSON |
|---|---|---|---|---|
| Token efficiency | Best — no markup overhead | Medium — `#`, `##`, `---` add tokens | Medium | Worst — quotes, braces everywhere |
| LLM read/write | Excellent | Excellent | Excellent | Good but error-prone |
| Human scannable | Good | Best | Best | Poor |
| Git-diffable | Excellent | Good | Good | Poor (whitespace) |
| Machine-parseable | Native | Needs two parsers | Regex/heuristic | Native |
| Syntax error risk | Medium (indentation) | Low | None | Medium (trailing commas) |

**Why YAML over Markdown**: The primary consumers are LLMs, not humans. YAML is ~15-25% fewer tokens than equivalent markdown for structured data. It's natively parseable, so tooling can validate, query, and diff it. The tradeoff (indentation sensitivity) is manageable since LLMs are good at YAML generation and our CLI can validate on write.

**Mitigation for YAML pitfalls**: The CLI will include a `context validate` command that checks syntax before accepting changes. The schema will use simple flat structures (no deeply nested objects) to minimize indentation errors.

---

## 2. Canonical Schema v0

### File: `.context.yaml`

```yaml
# --- Required fields ---
version: 1                          # Schema version (integer)
last_updated: "2026-02-10T14:30:00Z" # ISO 8601 timestamp
fingerprint: "a3f8b2c1"             # Short hash of directory contents (see §5)
scope: "src/auth/"                   # Relative path from project root

summary: |
  Handles user authentication and session management.
  JWT-based with access/refresh token pairs.

files:
  - name: "handler.py"
    purpose: "FastAPI route handlers for /login, /register, /refresh"
  - name: "tokens.py"
    purpose: "JWT creation, validation, and expiry logic"
  - name: "middleware.py"
    purpose: "Request auth middleware, extracts user from bearer token"
  - name: "models.py"
    purpose: "User and Session SQLAlchemy models"

interfaces:
  - name: "POST /login"
    description: "Authenticates user, returns JWT access + refresh tokens"
  - name: "POST /register"
    description: "Creates user account, returns 201 with user ID"
  - name: "verify_token(token: str) -> User"
    description: "Validates JWT and returns User object. Used by other modules."

# --- Optional fields (include when relevant) ---
decisions:
  - what: "JWT over server-side sessions"
    why: "Stateless, scales horizontally"
    tradeoff: "Revocation requires a blocklist table"

constraints:
  - "All endpoints except /health require authentication"
  - "Access tokens expire in 15 minutes"
  - "Passwords hashed with bcrypt, cost factor 12"

dependencies:
  internal:
    - "src/db/ — database models and connection"
    - "src/config/ — reads JWT_SECRET and TOKEN_EXPIRY"
  external:
    - "pyjwt ^2.8"
    - "bcrypt ^4.0"

current_state:
  working:
    - "Login and register endpoints fully tested"
  broken:
    - "Refresh endpoint has race condition under concurrent requests (#14)"
  in_progress:
    - "Adding rate limiting to login endpoint"

subdirectories:
  - name: "tests/"
    summary: "Unit and integration tests for auth module"
  - name: "migrations/"
    summary: "Alembic migration scripts for auth tables"

# --- Self-describing maintenance instruction (always present) ---
maintenance: |
  If you modify files in this directory, update this .context.yaml to reflect
  your changes. Update the files list, interfaces, and current_state sections.
  Do NOT update the fingerprint manually — run `context rehash` or it will be
  updated automatically on the next `context status` check.
  If you only read files in this directory, do not modify this file.
  Do not include secrets, API keys, passwords, or PII in this file.
```

### Required Fields (every `.context.yaml` must have)

| Field | Type | Purpose |
|---|---|---|
| `version` | integer | Schema version for forward compatibility |
| `last_updated` | ISO 8601 string | When this file was last updated |
| `fingerprint` | string | Hash of directory contents for staleness detection |
| `scope` | string | Relative path from project root |
| `summary` | string | 1-3 sentence description of what this directory does |
| `files` | list of {name, purpose} | Every file in the directory with a one-line purpose |
| `maintenance` | string | Self-describing instruction for LLMs |

### Optional Fields (catalog)

| Field | When to use |
|---|---|
| `interfaces` | When the directory exposes public APIs, functions, CLI commands, or endpoints |
| `decisions` | When non-obvious architectural choices were made (what/why/tradeoff) |
| `constraints` | When there are hard rules the code must follow |
| `dependencies` | When the directory depends on other internal modules or external packages |
| `current_state` | When things are in progress, broken, or need attention |
| `subdirectories` | When the directory has subdirectories with their own `.context.yaml` files |
| `environment` | When the directory needs specific env vars or config to run |
| `testing` | When there are specific test commands or test conventions for this directory |
| `todos` | When there are known future improvements planned |
| `data_models` | When the directory defines key data structures or schemas |
| `events` | When the directory emits or subscribes to events/messages |
| `config` | When the directory reads config files or feature flags |

---

## 3. Root `.context.yaml` — Special Fields

The root-level `.context.yaml` has additional required fields:

```yaml
version: 1
last_updated: "2026-02-10T14:30:00Z"
fingerprint: "b7c4d2e1"
scope: "."

project:
  name: "my-service"
  description: "REST API for user management with auth and CRUD"
  language: "python"
  framework: "fastapi"
  package_manager: "poetry"

summary: |
  A FastAPI service providing user management, authentication,
  and admin dashboard. Deployed on AWS ECS.

structure:
  - path: "src/auth/"
    summary: "Authentication and JWT token management"
  - path: "src/api/"
    summary: "REST endpoint handlers for users and admin"
  - path: "src/db/"
    summary: "Database models, migrations, and connection pooling"
  - path: "tests/"
    summary: "Pytest test suite with fixtures"

files:
  - name: "pyproject.toml"
    purpose: "Project config, dependencies, build settings"
  - name: "Dockerfile"
    purpose: "Container build for production deployment"
  - name: "docker-compose.yaml"
    purpose: "Local development environment with DB"

maintenance: |
  If you add a new top-level directory with code, add it to the structure list.
  If you modify files in this root directory, update the files list.
  Run `context rehash` after structural changes.
  Do not include secrets, API keys, passwords, or PII in this file.
```

---

## 4. Update Policy

### Who writes `.context.yaml` files

| Actor | When | What they write |
|---|---|---|
| `context init` | First setup | All `.context.yaml` files from scratch |
| `context regen <path>` | Manual regeneration | Regenerates specific directory's context |
| Any LLM (during coding) | After modifying files | Updates the relevant `.context.yaml` in-place |
| `context rehash` | After bulk changes | Updates fingerprints only (no content changes) |

### Self-describing update contract

Every `.context.yaml` contains a `maintenance` field with plain-English instructions. This is the mechanism that makes it LLM-agnostic — the instructions are in the file itself, readable by any model.

The instruction is deliberately simple and universal:
- "If you modify files, update this file"
- "If you only read files, don't touch this file"

This works because every major LLM (Claude, GPT, Gemini, Llama) follows in-file instructions when they encounter them. It's the same principle as CLAUDE.md — but embedded per-directory.

### Staleness detection

When an LLM reads a `.context.yaml`, the fingerprint lets it (or the tooling) know whether the file is current. If the fingerprint doesn't match the actual directory state, the context is stale and should be treated with lower confidence or regenerated.

### Conflict handling (v0: simple)

Two LLMs editing the same `.context.yaml` simultaneously is unlikely in v0 (single developer). If it happens, standard git conflict resolution applies — these are text files.

For v1+: a `context merge` command could intelligently resolve structural conflicts in YAML.

---

## 5. Freshness Model

### Fingerprint computation

```
fingerprint = shortHash(
  sort(
    for each file in directory (non-recursive, excluding .context.yaml):
      `${filename}:${mtime_epoch}:${size_bytes}`
  ).join("\n")
)
```

- **shortHash**: first 8 chars of SHA-256
- **non-recursive**: only files directly in this directory, not subdirectories
- **excludes**: `.context.yaml` itself, `.git/`, `node_modules/`, files in `.gitignore`
- **cheap**: only `stat()` calls, no file reads

### Staleness states

| State | Condition | Action |
|---|---|---|
| `fresh` | Stored fingerprint matches computed fingerprint | No action needed |
| `stale` | Fingerprints don't match | Warn user, suggest `context regen <path>` |
| `missing` | No `.context.yaml` exists for a directory | Suggest `context init` or `context regen <path>` |

### Reindex triggers

- `context status` — checks all fingerprints, reports stale directories
- `context rehash` — recomputes all fingerprints without regenerating content
- `context regen <path>` — full regeneration (reads files, calls LLM, rewrites context)
- `context watch` (future) — file watcher that flags staleness in real time

---

## 6. UX Flows

### Install

```bash
npm install -g dotcontext
```

That's it. No accounts, no login, no cloud service.

### `context init` — First-time setup on existing project

```
$ context init
Welcome to context.

Which LLM provider would you like to use for generating context?
  1. Anthropic (Claude)
  2. OpenAI (GPT)
  3. Google (Gemini)
  4. Ollama (local)
  > 1

Enter your Anthropic API key (or set ANTHROPIC_API_KEY):
  > sk-ant-...

Scanning project structure...
Found 14 directories with source code.

Generating context... (this may take a minute)
  [=====     ] 5/14 directories...

  ✓ .context.yaml              (root)
  ✓ src/.context.yaml
  ✓ src/auth/.context.yaml
  ✓ src/api/.context.yaml
  ✓ src/db/.context.yaml
  ✓ src/utils/.context.yaml
  ✓ tests/.context.yaml
  ... (7 more)

Done. 14 .context.yaml files created.
Run `context status` to check freshness.
```

**Under the hood**:
1. Walk directory tree, identify directories with source files
2. Skip: `node_modules/`, `.git/`, `dist/`, `build/`, files in `.gitignore`, directories with fewer than 1 source file
3. For each qualifying directory (bottom-up, so child context is available to parents):
   - Read all source files in the directory
   - Assemble prompt with file contents + any child `.context.yaml` summaries
   - Call LLM to generate structured YAML context
   - Validate YAML, compute fingerprint, write `.context.yaml`
4. Save config to `.context.config.yaml` in project root (provider, model, preferences)

### `context init --no-llm` — Static analysis mode (no API key needed)

```
$ context init --no-llm

Scanning project structure...
Found 14 directories with source code.

Generating structural context (no LLM)...
  ✓ 14 .context.yaml files created (structural only).

Note: Structural context includes file listings and detected exports.
For richer summaries, run `context regen` with an LLM provider.
```

**Design constraint**: `--no-llm` mode requires zero API keys and zero network calls. It must work offline, instantly, on any machine with Node.js installed. This is the adoption wedge — try it in 30 seconds.

This mode uses static analysis only:
- File listings with detected types (from extensions)
- Exported functions/classes/types (via tree-sitter or regex for common languages)
- Package.json/pyproject.toml metadata
- Directory structure
- No `summary`, `decisions`, or `constraints` (these need LLM reasoning)

### Day-to-day usage

The user just works normally with any LLM coding tool. The `.context.yaml` files are there. When the LLM opens a directory, it sees `.context.yaml` and reads it. The `maintenance` field tells it to update the file if it changes code.

**No user action required during normal development.**

### `context status` — Health check

```
$ context status

context health: 12 of 14 directories tracked

  ✓ fresh    .                        (root)
  ✓ fresh    src/
  ✓ fresh    src/auth/
  ⚠ stale    src/api/                 (3 files changed since last update)
  ✓ fresh    src/db/
  ✗ missing  src/api/v2/              (new directory, no .context.yaml)
  ✓ fresh    src/utils/
  ...

2 issues found. Run:
  context regen src/api/        # regenerate stale context
  context regen src/api/v2/     # generate context for new directory
```

### `context regen <path>` — Regenerate specific directory

```
$ context regen src/api/

Regenerating context for src/api/...
  Reading 6 files...
  Calling Claude (claude-sonnet-4-5-20250929)...
  ✓ src/api/.context.yaml updated

Fingerprint: a3f8b2c1 → d7e9f3a2
```

### `context rehash` — Update fingerprints only

```
$ context rehash

Updated fingerprints for 14 directories.
3 directories are stale (content unchanged, fingerprints updated).
```

### Recovery from bad context

```
$ context regen src/auth/ --force

This will regenerate src/auth/.context.yaml from scratch.
Current file will be overwritten. Continue? [y/N] y

  ✓ src/auth/.context.yaml regenerated.
```

---

## 7. CLI Commands (v0)

| Command | Description |
|---|---|
| `context init` | Scan project, generate all `.context.yaml` files (LLM or --no-llm) |
| `context status` | Check freshness of all `.context.yaml` files, report stale/missing |
| `context regen <path>` | Regenerate `.context.yaml` for a specific directory |
| `context regen --all` | Regenerate all `.context.yaml` files |
| `context rehash` | Recompute fingerprints without regenerating content |
| `context validate` | Check all `.context.yaml` files for syntax errors and schema compliance |
| `context show <path>` | Pretty-print a `.context.yaml` file |
| `context config` | View/edit provider settings (model, API key reference) |
| `context ignore <path>` | Add a directory to the ignore list |

---

## 8. Integration Strategy

### v0: Self-describing files + MCP server

The `.context.yaml` files work immediately with every LLM tool because:
1. Every LLM can read YAML
2. The `maintenance` field tells the LLM how to maintain the file
3. LLMs naturally discover `.context.yaml` when they `ls` or explore a directory
4. No special protocol or SDK wrapper required

This is the "install and forget" experience. The files are just there, and LLMs use them.

**How to boost adoption**: Add a line to the project's CLAUDE.md / .cursorrules / copilot-instructions.md:
```
When exploring a directory, read .context.yaml first if it exists.
Update .context.yaml when you modify files in a directory.
```

This one line makes any LLM tool context-aware.

**MCP server (ships in v0)**: Exposes the context store as an MCP server so LLMs can make structured queries instead of just reading files. Three tools:

- `query_context(scope, filter)` — retrieve `.context.yaml` content for a directory, optionally filtering to specific fields
- `check_freshness(path)` — is this context current? Returns fresh/stale/missing with details
- `list_contexts()` — list all tracked directories with staleness status

This is deliberately minimal. The passive file-based discovery still works in parallel — MCP is an accelerator on top, not a replacement.

### v1: Enhanced MCP + watch mode

- `propose_update(path, changes)` — suggest updates with approval workflow
- `context watch` — file watcher that flags staleness in real time
- `context merge` — intelligent YAML conflict resolution

### v2: Provider SDK wrappers

Wrap OpenAI/Anthropic/Google SDKs to auto-inject relevant `.context.yaml` content into system prompts based on which files the conversation references.

---

## 9. Security/Privacy

- **Local-first**: All data stays on disk. No network calls except to the configured LLM provider during `init`/`regen`.
- **API keys**: Stored in environment variables or `.context.config.yaml` (which should be in `.gitignore`). Never stored in `.context.yaml` files.
- **No sensitive data in context**: The `maintenance` instruction includes: "Do not include secrets, API keys, passwords, or PII in this file."
- **.gitignore**: `.context.config.yaml` should be gitignored (contains provider config). `.context.yaml` files themselves should be committed — they're project documentation.
- **LLM data**: File contents are sent to the configured LLM provider during `init`/`regen`. This is the same trust model as using any LLM coding tool.

---

## 10. Failure Modes & Mitigations

| Failure | Mitigation |
|---|---|
| LLM hallucinates wrong context during init | `context validate` checks schema; user reviews generated files; `--no-llm` mode provides ground-truth structure |
| `.context.yaml` becomes wildly outdated | Fingerprint staleness detection; `context status` shows stale dirs; LLMs see stale fingerprints and know to treat with lower confidence |
| Two LLMs edit same `.context.yaml` concurrently | v0: git handles it (merge conflict). v1: file locking or propose/approve flow |
| Huge monorepo (100k+ files) | Depth limit on init (default: 4 levels); `.contextignore` for excluding dirs; progressive init (one subtree at a time) |
| LLM ignores the maintenance instruction | Cannot be fully prevented — but reinforced by CLAUDE.md/.cursorrules one-liner; `context status` catches drift |
| YAML syntax errors in `.context.yaml` | `context validate` command; CLI validates before writing; LLMs are generally good at YAML |
| LLM reads stale `.context.yaml` and makes bad decisions | Fingerprint mismatch is visible in the file header; LLMs can compare fingerprint to actual directory; `context status` for human verification |

---

## 11. Project Structure

```
context/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .context.schema.json              # JSON Schema for .context.yaml
├── .context.config.schema.json       # JSON Schema for .context.config.yaml
├── src/
│   ├── index.ts                      # CLI entry point (commander)
│   ├── commands/
│   │   ├── init.ts                   # context init [--no-llm]
│   │   ├── status.ts                 # context status
│   │   ├── regen.ts                  # context regen <path> [--all] [--force]
│   │   ├── rehash.ts                 # context rehash
│   │   ├── validate.ts              # context validate
│   │   ├── show.ts                   # context show <path>
│   │   ├── config.ts                 # context config
│   │   └── ignore.ts                # context ignore <path>
│   ├── core/
│   │   ├── scanner.ts               # Directory walking, ignore rules
│   │   ├── fingerprint.ts           # SHA-256 hash, staleness detection
│   │   ├── schema.ts                # Zod schema for .context.yaml validation
│   │   └── writer.ts                # YAML serialization, file I/O
│   ├── generator/
│   │   ├── llm.ts                   # LLM-powered context generation
│   │   ├── static.ts                # Static analysis (--no-llm mode)
│   │   └── prompts.ts              # System/user prompts for LLM generation
│   ├── providers/
│   │   ├── index.ts                 # Provider interface + factory
│   │   ├── anthropic.ts             # Claude adapter
│   │   ├── openai.ts               # GPT adapter
│   │   ├── google.ts               # Gemini adapter
│   │   └── ollama.ts               # Ollama local adapter
│   ├── mcp/
│   │   ├── server.ts               # MCP server entry point (stdio transport)
│   │   └── tools.ts                # MCP tool definitions (query, freshness, list)
│   └── utils/
│       ├── config.ts                # Read/write .context.config.yaml
│       ├── ignore.ts                # .contextignore parsing
│       └── display.ts              # Terminal output formatting
├── tests/
│   ├── core/
│   │   ├── fingerprint.test.ts
│   │   ├── scanner.test.ts
│   │   ├── schema.test.ts
│   │   └── writer.test.ts
│   ├── generator/
│   │   ├── static.test.ts
│   │   └── llm.test.ts
│   ├── commands/
│   │   ├── init.test.ts
│   │   ├── status.test.ts
│   │   └── validate.test.ts
│   ├── mcp/
│   │   └── tools.test.ts
│   └── fixtures/                    # Sample project directories for testing
│       ├── simple-project/
│       ├── monorepo/
│       └── empty-project/
└── README.md
```

### Technology choices

| Choice | Decision | Reason |
|---|---|---|
| Language | TypeScript | npm distribution, LLM SDK support |
| Package manager | npm | `npm install -g dotcontext` or `npx dotcontext` |
| CLI framework | `commander` | Simple, well-known, low overhead |
| YAML parser | `yaml` (npm) | Full YAML 1.2 support, preserves comments |
| Schema validation | `zod` | Runtime validation, good TS integration |
| Test framework | `vitest` | Fast, native TS support, no config overhead |
| LLM SDKs | `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` | Direct provider SDKs, no abstraction layer for v0 |
| MCP SDK | `@modelcontextprotocol/sdk` | Official MCP TypeScript SDK |
| Static analysis | Regex for v0 (tree-sitter in future) | Extract exports/functions without LLM |
| Hashing | Node `crypto` (SHA-256) | Built-in, no deps |

---

## 12. Build Order (Implementation Sequence)

### Phase 1: Core (no external dependencies)
1. **Schema** (`core/schema.ts`) — Zod models for `.context.yaml` and root `.context.yaml`
2. **Fingerprint** (`core/fingerprint.ts`) — SHA-256 hash computation and comparison
3. **Scanner** (`core/scanner.ts`) — Directory walking with ignore rules, depth limits
4. **Writer** (`core/writer.ts`) — YAML serialization and file I/O
5. **Tests for Phase 1** — Unit tests for all core modules

### Phase 2: Static Generation
6. **Static generator** (`generator/static.ts`) — `--no-llm` mode
7. **Config utils** (`utils/config.ts`, `utils/ignore.ts`) — Config and ignore file handling
8. **Display utils** (`utils/display.ts`) — Terminal output formatting
9. **Tests for Phase 2**

### Phase 3: CLI Commands (using static generator only)
10. **CLI entry point** (`index.ts`) — Commander setup
11. **init command** (`commands/init.ts`) — `context init --no-llm`
12. **status command** (`commands/status.ts`) — Freshness checking
13. **validate command** (`commands/validate.ts`) — Schema validation
14. **rehash command** (`commands/rehash.ts`) — Fingerprint recomputation
15. **show command** (`commands/show.ts`) — Pretty-print
16. **regen command** (`commands/regen.ts`) — Regeneration (static-only for now)
17. **config command** (`commands/config.ts`) — Provider settings
18. **ignore command** (`commands/ignore.ts`) — Ignore list management
19. **Tests for Phase 3** — Command integration tests

### Phase 4: MCP Server
20. **MCP tool definitions** (`mcp/tools.ts`) — Tool schemas and handlers for query_context, check_freshness, list_contexts
21. **MCP server** (`mcp/server.ts`) — Stdio transport MCP server
22. **Tests for MCP**

### Phase 5: LLM Providers
23. **Provider interface** (`providers/index.ts`) — Abstract provider
24. **Anthropic provider** (`providers/anthropic.ts`)
25. **OpenAI provider** (`providers/openai.ts`)
26. **Google provider** (`providers/google.ts`)
27. **Ollama provider** (`providers/ollama.ts`)
28. **LLM generator** (`generator/llm.ts`) — Full context generation with LLM
29. **Prompts** (`generator/prompts.ts`) — Tuned prompts for context generation
30. **Wire LLM into init/regen commands** — Add `--no-llm` flag toggle
31. **Tests for Phase 5**

### Phase 6: Polish
32. **JSON Schemas** (`.context.schema.json`, `.context.config.schema.json`)
33. **README.md**
34. **package.json bin/scripts** — CLI binary setup, build scripts

---

## 13. Verification Plan

### Unit tests (vitest)
- Schema validation: valid/invalid `.context.yaml` round-trips
- Fingerprint: deterministic hashing, staleness detection
- Scanner: directory walking, ignore rules, depth limits
- Writer: YAML serialization preserves structure
- Static generator: produces valid schema output
- MCP tools: correct responses for query/freshness/list

### Integration tests
- Create fixture projects in `tests/fixtures/`
- Run `context init --no-llm` → verify `.context.yaml` files created
- Modify a file → `context status` → verify stale detection
- `context rehash` → verify fingerprint update
- `context validate` → verify all files pass
- `context show <path>` → verify pretty-print output

### Edge cases to test
- Empty directory
- Directory with only binary files
- Very large directory (100+ files)
- Nested directories (5+ levels)
- Directory with no changes (fingerprint should remain stable)
- Invalid YAML in `.context.yaml` (validate should catch)

### Manual E2E test
- Install globally, run on a real project
- Verify MCP server works in Claude Code (`claude mcp add`)
- Verify LLM generation with Anthropic API key

---

## 14. Package Name

**Name: `dotcontext`** — CLI command: `context`. The existing npm package is archived/dead (5 stars, last published Dec 2024). We'll use `dotcontext` as our package name and reclaim it on npm if needed (npm support handles disputes for abandoned packages).

- Install: `npm install -g dotcontext`
- Usage: `npx dotcontext init`
- Binary name: `context` (registered via `bin` in package.json)

---

## 15. Success Criteria and Kill Criteria

### v0 success criteria

- `context init --no-llm` completes in under 10 seconds on a repo with 50 directories
- `context status` reliably detects stale directories (zero false negatives)
- All generated `.context.yaml` files pass `context validate`
- `.context.yaml` files are clean, diff-friendly, and reviewable in git
- MCP tools return correct scoped results in Claude Code and Cursor
- At least one real workflow demonstrates reduced token usage or fewer file reads compared to baseline

### Kill criteria

- No measurable context reuse by LLMs compared to not having `.context.yaml` files
- High drift rate — users and LLMs do not maintain context files, making them actively misleading
- MCP usage is negligible and file-only discovery is not adopted by any tool
