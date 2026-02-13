# Benchmark Command

`context bench` compares baseline prompts (scoped tree + README excerpt) against context prompts (scoped `.context.yaml`) and reports accuracy, abstention, token, and latency deltas.

## Usage

```bash
context bench [options]
```

## Options

| Option | Description |
|---|---|
| `--json` | Output machine-readable JSON |
| `--iterations <n>` | Repeat each task `n` times |
| `--tasks <path>` | Reserved for future manual task-file support (currently no effect) |
| `--max-tasks <n>` | Maximum number of generated tasks |
| `--seed <n>` | Seed for deterministic sampling |
| `--category <cat>` | Run only one task category |
| `--out <file>` | Write JSON report to file |
| `--allow-stale` | Include stale context files instead of failing |
| `--repo <url>` | Clone and benchmark a remote repository |
| `--default-repos` | Run a multi-repo benchmark over curated defaults |
| `-p, --path <path>` | Project root for config and local benchmark mode |

## Modes

### Local Repository

```bash
context bench --max-tasks 24 --iterations 3 --seed 42
```

Uses your current project as the benchmark target.

### Remote Repository

```bash
context bench --repo https://github.com/colinhacks/zod --max-tasks 24 --seed 42
```

Clones the repo into a temp directory, runs static `context init`, then benchmarks.

### Multi-Repo Mode

```bash
context bench --default-repos --iterations 2 --out /tmp/bench.json
```

Runs the benchmark over curated repos and aggregates results.

## Prerequisites

- Provider must be configured in your invoking project:

```bash
context config --provider openai --model gpt-4o-mini
```

- Required provider API key env var must be set.
- Context files must be fresh unless `--allow-stale` is passed.

## Output Summary

Human-readable mode reports:

- Overall baseline vs context score with deltas
- Abstention rate change
- Estimated input token change
- Average latency
- Per-category performance

JSON mode includes full run metadata and per-task/per-iteration results for analysis pipelines.
