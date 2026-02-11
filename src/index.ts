#!/usr/bin/env node

import { resolve } from "node:path";
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { regenCommand } from "./commands/regen.js";
import { rehashCommand } from "./commands/rehash.js";
import { validateCommand } from "./commands/validate.js";
import { showCommand } from "./commands/show.js";
import { configCommand } from "./commands/config.js";
import { ignoreCommand } from "./commands/ignore.js";
import { startMcpServer } from "./mcp/server.js";

const program = new Command();

program
  .name("context")
  .description("Folder-level documentation for LLMs — .context.yaml files for every directory")
  .version("0.1.0");

program
  .command("init")
  .description("Scan project and generate all .context.yaml files")
  .option("--no-llm", "Use static analysis only (no API key needed)")
  .option("-p, --path <path>", "Project root path")
  .action(async (opts) => {
    await initCommand({ noLlm: opts.llm === false, path: opts.path });
  });

program
  .command("status")
  .description("Check freshness of all .context.yaml files")
  .option("-p, --path <path>", "Project root path")
  .action(async (opts) => {
    await statusCommand({ path: opts.path });
  });

program
  .command("regen [target]")
  .description("Regenerate .context.yaml for a specific directory")
  .option("--all", "Regenerate all .context.yaml files")
  .option("--force", "Overwrite without confirmation")
  .option("--no-llm", "Use static analysis only")
  .option("-p, --path <path>", "Project root path")
  .action(async (target, opts) => {
    await regenCommand(target, {
      all: opts.all,
      force: opts.force,
      noLlm: opts.llm === false,
      path: opts.path,
    });
  });

program
  .command("rehash")
  .description("Recompute fingerprints without regenerating content")
  .option("-p, --path <path>", "Project root path")
  .action(async (opts) => {
    await rehashCommand({ path: opts.path });
  });

program
  .command("validate")
  .description("Check all .context.yaml files for syntax and schema errors")
  .option("-p, --path <path>", "Project root path")
  .action(async (opts) => {
    await validateCommand({ path: opts.path });
  });

program
  .command("show <target>")
  .description("Pretty-print a .context.yaml file")
  .action(async (target) => {
    await showCommand(target);
  });

program
  .command("config")
  .description("View or edit provider settings")
  .option("--provider <provider>", "Set LLM provider (anthropic, openai, google, ollama)")
  .option("--model <model>", "Set model ID")
  .option("-p, --path <path>", "Project root path")
  .action(async (opts) => {
    await configCommand({ path: opts.path, provider: opts.provider, model: opts.model });
  });

program
  .command("ignore <target>")
  .description("Add a directory to .contextignore")
  .option("-p, --path <path>", "Project root path")
  .action(async (target, opts) => {
    await ignoreCommand(target, { path: opts.path });
  });

program
  .command("serve")
  .description("Start MCP server for LLM tool integration (stdio transport)")
  .option("-p, --path <path>", "Project root path")
  .action(async (opts) => {
    const rootPath = resolve(opts.path ?? ".");
    await startMcpServer(rootPath);
  });

program.parse();
