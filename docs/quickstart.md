# Quickstart

Get dotcontext running in 5 minutes. No API key needed.

## 1. Install

```bash
npm install -g dotcontext
```

Requires Node.js >= 18.

## 2. Generate Context Files

```bash
cd your-project
context init
```

```
Scanning project structure...
Found 6 directories with source code.

Generating structural context (no LLM)...
  ████████████████████████████████ 100%
  ✓ .context.yaml  (root)
  ✓ .context.yaml  src
  ✓ .context.yaml  src/core
  ✓ .context.yaml  src/commands
  ✓ .context.yaml  src/generator
  ✓ .context.yaml  tests

Done. 6 .context.yaml files created.
```

This uses static analysis by default — no API key, no cloud calls, fully offline. It detects file purposes, exports, dependencies, and project structure automatically.

## 3. Check Freshness

```bash
context status
```

```
  ✓ .                  fresh
  ✓ src/               fresh
  ✓ src/core/          fresh
  ✓ src/commands/      fresh
```

All directories show **fresh** because nothing has changed since generation. Edit a source file and run `context status` again — that directory will show **stale**.

## 4. View a Context File

```bash
context show src/core
```

```yaml
scope: src/core
summary: |
  Core scanning, fingerprinting, and schema validation.
files:
  - name: scanner.ts
    purpose: Recursive directory walker with gitignore support
  - name: fingerprint.ts
    purpose: SHA-256 content hashing for staleness detection
  - name: schema.ts
    purpose: Zod schemas for .context.yaml and .context.config.yaml
interfaces:
  - name: scanProject(rootPath, options)
    description: Walk directory tree, return ScanResult with files and children
dependencies:
  external:
    - yaml ^2.8
    - zod ^4.3
```

## 5. Validate

```bash
context validate              # Schema compliance check
context validate --strict     # Cross-reference against actual source code
```

Strict mode catches phantom files (listed but missing), unlisted files (on disk but not in context), and phantom interfaces (declared but not found in code exports).

## 6. Connect to Your LLM Tool

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

### Any MCP Client

```bash
context serve --path /path/to/project
```

The MCP server exposes three tools: `query_context`, `check_freshness`, and `list_contexts`. See [integrations.md](integrations.md) for detailed recipes.

## Next Steps

- Want richer summaries? Run `context init --llm` to use an LLM provider
- Want test evidence? Add `--evidence` flag to collect from existing test artifacts
- Want real-time monitoring? Run `context watch`
- See [schema.md](schema.md) for the full `.context.yaml` field reference
- See [trust-model.md](trust-model.md) to understand which fields are machine-derived vs LLM-generated
