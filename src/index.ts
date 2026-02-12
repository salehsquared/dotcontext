#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { regenCommand } from "./commands/regen.js";
import { rehashCommand } from "./commands/rehash.js";
import { validateCommand } from "./commands/validate.js";
import { showCommand } from "./commands/show.js";
import { configCommand } from "./commands/config.js";
import { ignoreCommand } from "./commands/ignore.js";
import { watchCommand } from "./commands/watch.js";
import { startMcpServer } from "./mcp/server.js";
import { loadEnvForCli } from "./utils/env.js";

export interface CommandHandlers {
  initCommand: typeof initCommand;
  statusCommand: typeof statusCommand;
  regenCommand: typeof regenCommand;
  rehashCommand: typeof rehashCommand;
  validateCommand: typeof validateCommand;
  showCommand: typeof showCommand;
  configCommand: typeof configCommand;
  ignoreCommand: typeof ignoreCommand;
  watchCommand: typeof watchCommand;
  startMcpServer: typeof startMcpServer;
}

const defaultHandlers: CommandHandlers = {
  initCommand,
  statusCommand,
  regenCommand,
  rehashCommand,
  validateCommand,
  showCommand,
  configCommand,
  ignoreCommand,
  watchCommand,
  startMcpServer,
};

export function createProgram(handlers: CommandHandlers = defaultHandlers): Command {
  const program = new Command();

  program
    .name("context")
    .description("Folder-level documentation for LLMs — .context.yaml files for every directory")
    .version("0.1.0");

  program
    .command("init")
    .description("Scan project and generate all .context.yaml files")
    .option("--llm", "Use LLM provider for richer context generation")
    .option("--evidence", "Collect test/typecheck evidence from existing artifacts")
    .option("-p, --path <path>", "Project root path")
    .action(async (opts) => {
      await handlers.initCommand({ noLlm: !opts.llm, path: opts.path, evidence: opts.evidence });
    });

  program
    .command("status")
    .description("Check freshness of all .context.yaml files")
    .option("-p, --path <path>", "Project root path")
    .action(async (opts) => {
      await handlers.statusCommand({ path: opts.path });
    });

  program
    .command("regen [target]")
    .description("Regenerate .context.yaml for a specific directory")
    .option("--all", "Regenerate all .context.yaml files")
    .option("--force", "Overwrite without confirmation")
    .option("--no-llm", "Use static analysis only")
    .option("--evidence", "Collect test/typecheck evidence from existing artifacts")
    .option("-p, --path <path>", "Project root path")
    .action(async (target, opts) => {
      await handlers.regenCommand(target, {
        all: opts.all,
        force: opts.force,
        noLlm: opts.llm === false,
        path: opts.path,
        evidence: opts.evidence,
      });
    });

  program
    .command("rehash")
    .description("Recompute fingerprints without regenerating content")
    .option("-p, --path <path>", "Project root path")
    .action(async (opts) => {
      await handlers.rehashCommand({ path: opts.path });
    });

  program
    .command("validate")
    .description("Check all .context.yaml files for syntax and schema errors")
    .option("--strict", "Cross-reference declared fields against source code")
    .option("-p, --path <path>", "Project root path")
    .action(async (opts) => {
      await handlers.validateCommand({ path: opts.path, strict: opts.strict });
    });

  program
    .command("show <target>")
    .description("Pretty-print a .context.yaml file")
    .action(async (target) => {
      await handlers.showCommand(target);
    });

  program
    .command("config")
    .description("View or edit provider settings")
    .option("--provider <provider>", "Set LLM provider (anthropic, openai, google, ollama)")
    .option("--model <model>", "Set model ID")
    .option("--max-depth <depth>", "Set maximum scan depth")
    .option("--ignore <dirs...>", "Add directories to ignore list")
    .option("--api-key-env <var>", "Set environment variable name for API key")
    .option("-p, --path <path>", "Project root path")
    .action(async (opts) => {
      await handlers.configCommand({
        path: opts.path,
        provider: opts.provider,
        model: opts.model,
        maxDepth: opts.maxDepth,
        ignore: opts.ignore,
        apiKeyEnv: opts.apiKeyEnv,
      });
    });

  program
    .command("ignore <target>")
    .description("Add a directory to .contextignore")
    .option("-p, --path <path>", "Project root path")
    .action(async (target, opts) => {
      await handlers.ignoreCommand(target, { path: opts.path });
    });

  program
    .command("watch")
    .description("Watch for file changes and report staleness in real-time")
    .option("-p, --path <path>", "Project root path")
    .option("--interval <ms>", "Debounce interval in milliseconds", "500")
    .action(async (opts) => {
      await handlers.watchCommand({ path: opts.path, interval: opts.interval });
    });

  program
    .command("serve")
    .description("Start MCP server for LLM tool integration (stdio transport)")
    .option("-p, --path <path>", "Project root path")
    .action(async (opts) => {
      const rootPath = resolve(opts.path ?? ".");
      await handlers.startMcpServer(rootPath);
    });

  return program;
}

export async function runCli(
  argv: string[] = process.argv,
  handlers: CommandHandlers = defaultHandlers,
): Promise<void> {
  await loadEnvForCli(argv);
  const program = createProgram(handlers);
  await program.parseAsync(argv);
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runCli().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  });
}
