# Trust Model

Not all fields in a `.context.yaml` are created equal. Some are machine-derived ground truth. Others are LLM-generated narrative that may contain inaccuracies. The `derived_fields` array tells you which is which.

## Field Provenance

| Field | Source | Trust Level |
|---|---|---|
| `version`, `last_updated`, `fingerprint`, `scope` | Always machine-generated | Ground truth |
| `files` (names) | Filesystem scan | Ground truth |
| `files[].purpose` (static mode) | Heuristic from filename/content | High confidence |
| `files[].purpose` (LLM mode) | LLM-generated | Cross-check with code |
| `files[].test_file` | Heuristic filename matching | Best-effort guess |
| `dependencies.external` | Parsed from package.json / requirements.txt / Cargo.toml / go.mod | Ground truth |
| `dependencies.internal` | Parsed from import/require statements | Ground truth |
| `interfaces` (static mode) | AST-extracted via tree-sitter | High confidence (5 languages) |
| `interfaces` (LLM mode) | LLM-generated | Cross-check with code |
| `evidence` | Read from test artifact files | Ground truth (if artifacts current) |
| `project`, `structure` (static mode) | Filesystem scan + manifest parsing | Ground truth |
| `subdirectories` | Filesystem scan | Ground truth |
| `summary` | LLM-generated narrative | Interpret with caution |
| `decisions` | LLM-generated narrative | Interpret with caution |
| `constraints` | LLM-generated narrative | Interpret with caution |
| `current_state` | LLM-generated narrative | Interpret with caution |
| `maintenance` | Static template | Ground truth |

### How to Read `derived_fields`

The `derived_fields` array lists JSON pointer-style paths for fields that were machine-derived:

```yaml
derived_fields:
  - "version"
  - "last_updated"
  - "fingerprint"
  - "scope"
  - "dependencies.external"
  - "dependencies.internal"
  - "subdirectories"
  - "structure"
  - "evidence"
```

**If a field is in `derived_fields`**: it was computed from source code, manifests, or artifacts. Treat it as structural fact.

**If a field is NOT in `derived_fields`**: it was either LLM-generated or human-written. Treat it as narrative — useful context but not guaranteed accurate.

## Freshness Model

### What the Fingerprint Measures

```
fingerprint = SHA256(sorted(filename:mtime:size for each file))[:8]
```

The fingerprint is computed from `stat()` calls only — no file reads. It captures:
- File additions (new filename in the sorted list)
- File deletions (filename removed from list)
- File modifications (mtime and/or size change)

### What "Stale" Means

| State | What it tells you |
|---|---|
| **fresh** | No files have been added, removed, or modified since the context was generated. The machine-derived fields are current. LLM-generated fields were accurate at generation time. |
| **stale** | At least one file has changed. Machine-derived fields may be outdated. LLM-generated summaries may no longer reflect the code. |
| **missing** | No `.context.yaml` exists for this directory. |

### What Freshness Does NOT Guarantee

**Stale does not mean wrong.** A formatting-only change to a source file triggers staleness, but the summary is still accurate. A file touch without content changes also triggers staleness.

**Fresh does not mean correct.** The LLM may have generated an inaccurate summary at the time of generation. Freshness only confirms that files haven't changed since then — not that the narrative was right.

**Fingerprints are not content-stable.** Two identical file trees with different modification times produce different fingerprints. This is a deliberate tradeoff — `stat()` is cheap, content hashing would be expensive for large directories.

## When to Trust, Verify, or Regenerate

| Situation | Action |
|---|---|
| Context is fresh, you need file/dependency info | Trust it — these are machine-derived |
| Context is fresh, you need summary/decisions | Trust with caution — LLM narratives can have inaccuracies |
| Context is stale, you need file/dependency info | Verify or regenerate — files have changed |
| Context is stale, you need summary/decisions | Regenerate — summary may no longer reflect the code |
| `validate --strict` reports phantom files | Context lists files that no longer exist — regenerate |
| `validate --strict` reports phantom interfaces | Context declares interfaces not found in exports — cross-check |

## For LLM Tool Developers

If you're building an MCP client or tool that reads `.context.yaml`:

1. **Always check freshness first.** Use `check_freshness` MCP tool or compare the stored `fingerprint` against a fresh computation.
2. **Use `derived_fields` to decide trust level.** Fields listed there are machine-derived and reliable (when fresh).
3. **Treat summaries as helpful context, not ground truth.** Even fresh summaries are LLM-generated narratives.
4. **Prefer `query_context` with filters** to request only the fields you need, reducing token usage.
5. **If context is stale, tell the user** rather than silently relying on outdated information.
