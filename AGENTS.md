# AGENTS.md

> Instructions for AI coding agents working in this repository.
> Project: dotcontext

<!-- dotcontext:agents-section -->
## Project Context

This project uses [dotcontext](https://github.com/dotcontext/cli) for structured codebase documentation.

**Every directory with source files contains a `.context.yaml` file.** It describes:

- What the directory contains and its purpose (summary)
- Architectural decisions and constraints (things you can't infer from code)
- Subdirectory routing (what's inside each subdirectory)

### How to Use Context Files

1. **Before exploring a directory**, read its `.context.yaml` summary to understand what it does
2. **Before modifying code**, check `decisions` and `constraints` for rationale and hard rules
3. **After modifying files**, update the summary if the directory's purpose changed
4. **To check freshness**, run `context status` — stale contexts may have outdated information

### Directory Index

| Directory | Summary |
|-----------|---------|
| `.` (root) | This project provides structured documentation for LLMs using \`.context.yaml\` files at each directory level. It facilitates context understanding by summarizing directory purposes, architectural decisions, and key constraints, enhancing the usability of code for AI agents.  |
| `docs` | The docs directory contains comprehensive documentation for using and configuring dotcontext, including CI/CD integration, integration with various tools, and limitations. It serves as a guide for developers to effectively implement context validation and management in their projects.  |
| `OneContext_analysis` | OneContext_analysis provides essential documentation and user guidance for the OneContext platform, which allows teams to manage AI agents through shared contexts and session management. It supports functionalities such as running agents, sharing contexts, and resuming sessions.  |
| `OneContext_analysis/_npm_inspect` | This directory provides an npm wrapper for the OneContext AI Python package, enabling its installation and command execution through Node.js. It simplifies interaction with the underlying Python package for JavaScript developers.  |
| `OneContext_analysis/_npm_inspect/package` | This directory provides an npm wrapper for the OneContext AI Python package, facilitating installation and command execution through Node.js. It includes scripts for managing the Python package installation and command invocation.  |
| `OneContext_analysis/_npm_inspect/package/bin` | This directory contains scripts that serve as entry points for executing specific commands related to the OneContext analysis tool. Each script invokes a common runner function with different command arguments.  |
| `OneContext_analysis/_pypi_inspect` | The _pypi_inspect directory contains components extracted from the aline_ai Python package, facilitating its integration into the ReAlign project. It is responsible for managing AI agent chat sessions, organizing session data, and ensuring user authentication while interfacing with AI tools for processing.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted` | The aline_ai_extracted directory contains the extracted components of the aline_ai Python package, version 0.8.1, and supports the core functionalities of the ReAlign project. It manages AI agent chat sessions, including session data organization and user authentication, while integrating with AI tools for processing.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/aline_ai-0.8.1.dist-info` | This directory contains metadata for the Python package aline_ai version 0.8.1. It defines console scripts for command line interface usage, connecting them to the realign.cli application.   |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign` | The \`realign\` directory manages the core functionalities of the ReAlign project, facilitating the tracking and versioning of AI agent chat sessions. It handles session data organization, user authentication, and integrates with AI tools for session processing and summarization.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/adapters` | This directory provides session adapters for different AI coding CLI tools, allowing for unified session management, project path extraction, and turn detection across various tools. The adapters serve as a bridge between the specifics of each CLI's session format and a common interface for managing sessions.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/claude_hooks` | This directory contains a set of hooks for integrating with Claude Code, including mechanisms for handling permission requests, completion notifications, and user prompt submissions. It enables communication with an external dashboard and manages the installation and configuration of these hooks within the Claude environment.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/codex_hooks` | This directory provides integrations for the OpenAI Codex CLI using best-effort hooks and installers. It ensures that notifications are properly set up to enqueue session processing tasks in Aline's SQLite database when Codex completes a turn.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/commands` | This directory contains command modules for the ReAlign project, primarily focusing on user commands related to managing agents, contexts, sharing, and session history. It facilitates functionalities such as configuration management, agent synchronization, authentication, and command-line exploration of recorded sessions.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/dashboard` | This directory implements the Aline Dashboard, an interactive terminal user interface (TUI) for monitoring and managing the Aline CLI. It includes core application logic, branding, clipboard functionality, diagnostics, state management, and terminal backend integration.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/dashboard/backends` | This directory contains terminal backend implementations for the Aline Dashboard, specifically for iTerm2 and Kitty terminals. These backends enable the Dashboard to create and manage terminal sessions natively, enhancing performance and user experience.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/dashboard/screens` | This directory contains modal screens for the dashboard, providing user interfaces to manage and display various aspects of agents and events. It includes functionality for creating, detailing, and confirming actions related to agents and events, thereby facilitating user interaction with the system.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/dashboard/widgets` | This directory contains various widget components for the Aline Dashboard, implementing interactive UI elements such as tables, panels, and buttons for displaying and managing data related to agents, events, and configurations.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/db` | This directory implements the database module for ReAlign, providing an interface for SQLite database operations and managing data migrations from JSON files. It includes classes and functions for managing session, project, and agent data, as well as handling database initialization and schema management.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/events` | This directory contains utilities for generating summaries of events and sessions using Language Learning Models (LLMs) and managing their related updates in a database. It facilitates the maintenance and population of agent descriptions and event summaries based on session data.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/models` | This directory contains data models for event representation, focusing on grouping related commits into structured events with associated metadata. It supports both manual and automated event generation, capturing important temporal and semantic information.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/prompts` | This directory implements a prompt preset system for chat agents, enabling customization of agent behavior through predefined and user-defined prompts. It includes functionality to load, display, and manage these presets effectively.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/tracker` | This directory contains the tracker module, which serves as a placeholder for future tracking implementations. Currently, it has transitioned from Git-based tracking to employing SQLite for data storage.  |
| `OneContext_analysis/_pypi_inspect/aline_ai_extracted/realign/triggers` | This directory implements a modular trigger system for detecting and managing conversation turns in various session formats, including Claude, Codex, and Gemini. Each trigger handles the specifics of turn detection and extraction for its respective session type, enabling flexible integration with different chat systems.  |
| `scripts` | The scripts directory contains utilities for managing grammar files and generating JSON Schema files from Zod schemas. These scripts automate the tasks of copying pre-built WebAssembly grammar files and creating schema definitions for validation purposes.  |
| `src` | This directory contains the core logic for the command-line interface (CLI) of the context management tool, facilitating operations such as configuration, context file generation, and project health checks through various command modules. It serves as the main entry point for user interactions with the system.  |
| `src/commands` | This directory contains command modules that facilitate various operations, including configuring settings, generating context files, and checking the health of the project structure. Each command interacts with project files and configurations to maintain coherence and facilitate user workflows.  |
| `src/core` | The \`src/core\` directory provides functionalities for computing fingerprints of project directories, managing agent markdown files, and scanning project structures to identify directories needing context management. It serves as a vital component for maintaining project integrity and facilitating updates.  |
| `src/generator` | The \`src/generator\` directory is responsible for generating context YAML files from source code through both static analysis and LLM-based methods. It includes functionality to detect exports, dependencies, and other project details to create comprehensive context files.  |
| `src/mcp` | The \`src/mcp\` directory implements the Model Context Protocol server, handling context queries, freshness checks, and tool registrations for project scopes. It facilitates interaction with \`.context.yaml\` files and provides structured documentation through a JSON-RPC channel.  |
| `src/providers` | This directory contains implementations of various LLM (Large Language Model) providers, each adapted to a common interface. It allows for the creation and usage of different models from providers like Anthropic, Google, and OpenAI, enabling flexible integration into applications.  |
| `src/utils` | The src/utils directory contains utility functions for handling configuration, environment variables, display messages, and concurrency. It provides essential helpers to manage application settings and present user messages effectively.  |
| `tests` | This directory contains unit tests for the project's functionalities, ensuring that various components work correctly through automated testing. It includes tests for detecting exports and dependencies, environmental configurations, and other core functionalities.  |
| `tests/commands` | The tests/commands directory contains unit tests for various command functionalities including configuration management, initialization, and validation within the context of a software project. It ensures the integrity and correctness of command behaviors through automated testing using Vitest.  |
| `tests/core` | The tests/core directory contains tests for the core functionality of the markdown writer module. It verifies the reading, writing, and updating of AGENTS.md files in various scenarios to ensure data integrity and expected behavior.  |
| `tests/fixtures` | The tests/fixtures directory provides sample configurations and mock data for testing various project setups, including monorepos, simple projects, and context-specific scenarios. It facilitates structured and reusable test data management to support unit testing and integration testing processes.  |
| `tests/fixtures/monorepo` | This directory serves as a fixture configuration for a monorepo setup utilizing workspaces to manage multiple packages. It ensures cohesive interactions and shared definitions across the various components of the project.  |
| `tests/fixtures/monorepo/packages` | This directory contains packages for a monorepo, including shared TypeScript definitions and an API server. It facilitates consistent type usage across packages and manages the core functionality for handling API requests.  |
| `tests/fixtures/monorepo/packages/api` | This directory contains the API server for the monorepo, managing the HTTP server functionality for API operations. It serves as the main entry point for routing and handling API requests.  |
| `tests/fixtures/monorepo/packages/api/src` | This directory contains the source code for the API server, which defines the functionality to start an HTTP server on a specified port. It serves as the entry point for API-related operations in the monorepo.  |
| `tests/fixtures/monorepo/packages/shared` | This directory contains shared TypeScript type definitions for the monorepo's packages, facilitating a consistent interface for configuration management. It specifically defines the \`Config\` interface that can be utilized across different packages.  |
| `tests/fixtures/monorepo/packages/shared/src` | This directory contains shared TypeScript type definitions used across the monorepo's packages. It specifically defines the \`Config\` interface for configuration management.  |
| `tests/fixtures/simple-project` | This directory contains a simple TypeScript project setup for foundational testing purposes. It includes configuration files for building and managing the project structure, focusing on a minimal codebase that highlights essential TypeScript functionality.  |
| `tests/fixtures/simple-project/src` | This directory contains the source code for a simple project that includes a main entry function and a utility function for addition. It serves as a foundational example for testing and demonstrating basic TypeScript functionality.  |
| `tests/fixtures/with-contextignore` | This directory contains test fixtures for unit testing purposes, including both permanent and temporary mock data and scenarios relevant to the application's context. It provides a structured way to manage and utilize test data during the testing process.  |
| `tests/fixtures/with-contextignore/src` | This directory contains test fixtures used for unit testing purposes. It serves as a source for mock data and scenarios relevant to the application's context.   |
| `tests/fixtures/with-contextignore/tmp` | This directory contains temporary test fixtures used for unit testing within the project. It serves as a placeholder for data or variables needed during test execution.  |
| `tests/generator` | The tests/generator directory contains unit tests for the markdown generation functionality related to agents. It ensures that various markdown generation utilities work correctly by validating their output against expected results.  |
| `tests/mcp` | This directory contains unit tests for the MCP (Model Context Protocol) server and its associated tools. It validates functionality such as server startup, handling of context queries, freshness checks, and tool registration.  |
| `tests/utils` | This directory contains unit tests for utility functions, specifically for testing asynchronous operations with concurrency control. It ensures the correctness and reliability of the utility methods used within the application.  |

### Maintenance

When you significantly change files in a directory, update its `.context.yaml`:
- Update `summary` if the directory's purpose shifted
- Update `decisions` if architectural choices changed
- Update `constraints` if hard rules changed

The `maintenance` field in each `.context.yaml` contains specific instructions.
<!-- dotcontext:agents-section-end -->
