# AGENTS.md

> Instructions for AI coding agents working in this repository.
> Project: dotcontext

<!-- dotcontext:agents-section -->
## Project Context

This project uses [dotcontext](https://github.com/dotcontext/cli) for structured codebase documentation.

**Every directory with source files contains a `.context.yaml` file.** Before reading source files in any directory, read its `.context.yaml` first — it describes:

- What the directory contains and its purpose
- Key files and their roles
- Public interfaces and exports
- Dependencies (internal and external)
- Architectural decisions, constraints, and current state

### How to Use Context Files

1. **Before exploring a directory**, read its `.context.yaml` to understand what's there without opening every file
2. **Before modifying code**, check the `interfaces` and `decisions` fields to understand contracts and rationale
3. **After modifying files**, update the directory's `.context.yaml` to reflect your changes (the `maintenance` field has instructions)
4. **To check freshness**, run `context status` — stale contexts may have outdated information

### Directory Index

| Directory | Summary |
|-----------|---------|
| `.` (root) | This project contains structured documentation for a codebase using .context.yaml files for each directory, enabling LLMs to understand the code structure and functionality without requiring direct access to the source files.  |
| `docs` | This directory contains documentation for using dotcontext in CI/CD pipelines, integrations with LLM tools, limitations, and troubleshooting common issues.  |
| `OneContext_analysis` | The OneContext_analysis directory contains documentation for the OneContext platform, which provides a unified context for AI agents, allowing efficient management of agent sessions, context sharing, and collaborative interaction.  |
| `OneContext_analysis/_npm_inspect` | The OneContext AI directory provides an npm wrapper for the aline-ai Python package, enabling the installation and execution of related commands along with managing dependencies through scripts.  |
| `OneContext_analysis/_npm_inspect/package` | The OneContext AI directory serves as an npm wrapper for the aline-ai Python package, facilitating installation and execution of related commands. It includes scripts for command handling and a post-installation script to manage dependencies.  |
| `OneContext_analysis/_npm_inspect/package/bin` | This directory contains command-line scripts that execute specific commands related to the OneContext project. Each script delegates execution to a common runner module.  |
| `OneContext_analysis/_pypi_inspect` | The OneContext_analysis/_pypi_inspect directory provides tools for inspecting and managing Python packages, specifically focusing on the Aline AI package and its chat session management for version 0.8.1.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted` | The Aline AI extracted directory provides functionalities for the Aline AI package, including metadata for version 0.8.1 and tools for tracking and managing AI agent chat sessions.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/aline_ai-0.8.1.dist-info` | This directory contains metadata files for the Aline AI package version 0.8.1, detailing entry points for command-line interfaces and the top-level package structure.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign` | The \`realign\` directory contains components for tracking and versioning AI agent chat sessions, integrating functionality with various AI CLI tools, and managing session-related data.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/adapters` | The directory contains session adapters for various AI coding CLI tools, facilitating session discovery, project path extraction, and turn detection for each specific CLI.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/claude_hooks` | The Claude Hooks module contains functionality for integrating with AI coding assistants, specifically handling permission requests and completion signaling through Claude Code hooks. It includes auto-installation scripts for various hooks and manages signaling for user actions.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/codex_hooks` | This directory provides integrations for the OpenAI Codex CLI, including hooks for notifying and configuring the CLI's behavior via various configuration files.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/commands` | The commands directory contains implementations for various command-line interface (CLI) commands required for managing and interacting with the ReAlign system. It includes functionalities for authentication, agent management, configuration, context management, and more.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/dashboard` | The dashboard directory contains the Aline Interactive Dashboard, a TUI application for monitoring and managing Aline, featuring local API services, error diagnostics, clipboard handling, and terminal backend management.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/dashboard/backends` | This directory implements terminal backends for the Aline Dashboard, specifically for managing native terminal instances in iTerm2 and Kitty. It allows the creation and management of terminal tabs, enhancing performance and user experience by avoiding the use of tmux.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/dashboard/screens` | This directory contains modal screens for a dashboard application, facilitating user interactions for managing agents, events, and shared content within the application.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/dashboard/widgets` | This directory contains the components for the Aline Dashboard, specifically the various panels and widgets used for displaying and interacting with data related to sessions, agents, events, and configurations.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/db` | This directory implements a database module for the ReAlign application, providing SQLite database interactions, data migrations, and locking mechanisms for concurrent access.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/events` | This directory contains utilities for generating summaries and descriptions for agents, events, and sessions using a large language model (LLM).  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/models` | This directory contains event data models for grouping related commits in a project. It defines the structure for events, including their attributes, source, and metadata.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/prompts` | This directory contains a prompt preset system for chat agents, managing different customizable prompts that dictate the agents' behavior for various scenarios.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/tracker` | The tracker module serves as a placeholder for future implementations related to tracking functionality. It has transitioned from Git-based tracking to using SQLite for data storage.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/triggers` | This directory contains components for detecting and analyzing conversation turns in various session formats, including Claude, Codex, and Gemini. It provides a flexible, pluggable trigger system for extracting structured information from dialogues.  |
| `scripts` | The scripts directory contains automation scripts to manage grammar files and generate JSON Schema files from Zod schemas.  |
| `src` | The src directory implements a command-line tool for generating, validating, and managing .context.yaml files for projects, leveraging a variety of functionalities through commands for initialization, regeneration, and status checks.  |
| `src/commands` | The \`commands\` directory contains various command implementations for managing project configurations and context files, including commands for initialization, configuration updates, status checks, validation, and regeneration of context files.  |
| `src/core` | The src/core directory contains utilities for managing project fingerprints, markdown generation for agents, and scanning directory structures for context data. It provides functions for calculating file fingerprints, reading and writing markdown files, and scanning project directories for relevant files.  |
| `src/generator` | Generates a .context.yaml file for directory context and documentation generation based on source code analysis. |
| `src/mcp` | This directory implements a Model Context Protocol (MCP) server with tools for querying and managing context files in a project. It includes functionalities to check context freshness and list contexts across directories.  |
| `src/providers` | The \`src/providers\` directory contains multiple implementations of a language model provider interface, allowing interaction with different AI models from various vendors through a unified API.  |
| `src/utils` | The src/utils directory provides utility functions for managing configuration, environment variables, display messages, and concurrent processing in a project.  |
| `tests` | The tests directory contains unit tests for various modules within the application, ensuring proper functionality and correctness of features such as dependency detection, environment variable management, file scanning, and context generation.  |
| `tests/commands` | This directory contains unit tests for various command functionalities in the application, ensuring commands such as config management, validation, status checking, and rehashing behave as expected within a temporary environment.  |
| `tests/core` | This directory contains unit tests for the markdown-writer module, which manages the reading and writing of AGENTS.md files. The tests ensure functionality such as creating, updating, and validating the contents of markdown files based on specified entries.  |
| `tests/fixtures` | The \`tests/fixtures\` directory provides sample files and configurations for various testing scenarios, enabling the development and testing of code across different project structures.  |
| `tests/fixtures/monorepo` | The \`tests/fixtures/monorepo\` directory defines a monorepo structure with workspace support for managing multiple packages within a single repository.  |
| `tests/fixtures/monorepo/packages` | The \`tests/fixtures/monorepo/packages\` directory contains two primary packages for a monorepo setup, providing essential functionality and shared components for API handling and shared configurations.  |
| `tests/fixtures/monorepo/packages/api` | This directory houses the API package for the monorepo, containing the package configuration and source code for the API server functionality.  |
| `tests/fixtures/monorepo/packages/api/src` | This directory contains code for starting an API server.  |
| `tests/fixtures/monorepo/packages/shared` | This directory contains the shared package configuration for a monorepo setup, including shared types for consistent configurations across various packages.  |
| `tests/fixtures/monorepo/packages/shared/src` | This directory contains types for the shared configuration used across packages in a monorepo setup.  |
| `tests/fixtures/simple-project` | This directory contains configuration files for a simple project using TypeScript, which compiles down to ES2022 and utilizes Node16 modules.  |
| `tests/fixtures/simple-project/src` | This directory contains TypeScript source files for a simple project that includes a main function and a utility function for addition.  |
| `tests/fixtures/with-contextignore` | This directory contains files relevant to the "with-contextignore" project, including configuration for the project and test fixtures for a testing framework. It serves as a workspace for developing and testing code with a specific focus on managing context-related files.  |
| `tests/fixtures/with-contextignore/src` | This directory contains a single TypeScript file that exports a constant value.  |
| `tests/fixtures/with-contextignore/tmp` | This directory contains test fixture files used in the context of a broader testing framework.  |
| `tests/generator` | The tests/generator directory contains unit tests for various functions in the markdown module, which is responsible for generating and manipulating markdown content related to agents.  |
| `tests/mcp` | This directory contains tests for the MCP (Model Context Protocol) server and tool functionality, ensuring proper behavior of server initialization and context handling.  |
| `tests/utils` | This directory contains unit tests for the utility function poolMap, verifying its behavior with a variety of input scenarios and concurrency limits.  |

### Maintenance

When you add, remove, or significantly change files in a directory, update its `.context.yaml`:
- Update the `files` list if files were added or removed
- Update `interfaces` if public APIs changed
- Update `summary` if the directory's purpose shifted
- Update `dependencies` if imports changed

The `maintenance` field in each `.context.yaml` contains specific instructions.
<!-- dotcontext:agents-section-end -->
