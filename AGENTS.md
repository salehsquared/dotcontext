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
| `.` (root) | The root directory provides folder-level documentation for LLMs, containing \`.context.yaml\` files for every subdirectory to summarize their purpose and structure, as well as architectural decisions and constraints.  |
| `docs` | The \`docs\` directory provides comprehensive information and guidance on using the dotcontext tool, including CI/CD integration, usage patterns, limitations, and quickstart instructions for generating and validating context files. It serves as a resource for both new users and developers seeking to understand the architecture and operational constraints of the tool.  |
| `scripts` | The scripts directory contains utility scripts for building grammars, generating JSON schemas from Zod schemas, and managing local project context settings. These scripts automate essential tasks to facilitate project setup and schema management.  |
| `src` | The src directory serves as the core implementation area for a command-line tool that generates and manages \`.context.yaml\` documentation files for codebases. It encapsulates various functionalities including command handling, context generation, and project health checks.  |
| `src/bench` | The \`src/bench\` directory contains functionalities for benchmarking code understanding using a set of tasks, scoring methods, and various prompts. It integrates git operations for commit analysis and computes dependency structures, guiding task generation and evaluation for AI-assisted code comprehension.  |
| `src/commands` | The src/commands directory contains various command implementations that manage project initialization, configuration, benchmarking, and context file handling in a structured manner. Each command handles specific functionalities related to the project's context management lifecycle.  |
| `src/core` | The \`src/core\` directory provides utilities for managing directory fingerprints, updating markdown files related to agents, and scanning project directories to detect context requirements. It encapsulates functionalities for file management, ignoring patterns, and maintaining state information.  |
| `src/generator` | This directory is responsible for generating contextual YAML documentation for codebases by analyzing source files and extracting relevant metadata such as exports and dependencies. It supports functionalities like detecting external dependencies, collecting evidence from test artifacts, and leveraging AST parsing for code analysis.  |
| `src/mcp` | The \`src/mcp\` directory implements the Model Context Protocol (MCP) server, providing functionality to manage and query project context stored in \`.context.yaml\` files. It establishes a connection via standard I/O and allows interaction with the context through various tools.  |
| `src/providers` | This directory implements various LLM provider classes that adhere to a common interface, allowing for the generation of text responses from different language models. Each provider encapsulates the specifics of interacting with an external API or SDK.   |
| `src/utils` | The src/utils directory provides utility functions for managing configurations, environment variables, and displaying messages. It facilitates tasks such as loading configuration files, managing environment settings, processing items in parallel, and estimating tokens in directory structures.  |
| `tests` | The tests directory contains unit tests for various components of the application, ensuring functionality and reliability through structured tests across modules including command execution, core markdown management, generator validations, MCP protocol behaviors, utility functions, and benchmarking features.  |
| `tests/bench` | This directory contains tests for the benchmarking and evaluation features of the codebase, validating the functionality of various modules such as Git commit extraction, dependency building, task generation, and scoring methods. The tests ensure reliability and correctness of the functions managing code analysis and reporting.  |
| `tests/commands` | This directory contains unit tests for command functionalities within the application, ensuring that commands execute correctly and handle various scenarios as expected. It promotes code reliability and helps catch regressions early in the development process.  |
| `tests/core` | The tests/core directory contains unit tests for the markdown-writer functionalities, ensuring that the management of AGENTS.md files behaves as expected. It validates reading, writing, and updating operations related to markdown files in a structured manner.  |
| `tests/fixtures` | The tests/fixtures directory contains structured test fixtures to support unit testing across various projects. It includes a monorepo structure, a simple project demonstration, and specific test sources to organize and isolate test data from application code.  |
| `tests/fixtures/monorepo` | This directory contains fixtures for testing within a monorepo structure, facilitating organized testing across multiple services by including specific packages like the API server and shared TypeScript types.  |
| `tests/fixtures/monorepo/packages` | This directory contains fixtures used for testing within a monorepo structure. It includes specific packages like the API server and shared TypeScript types, facilitating organized testing across the services.  |
| `tests/fixtures/monorepo/packages/api` | This directory contains the API package for a monorepo, implementing the API server responsible for handling incoming requests. It plays a central role in the service architecture by coordinating interactions between services.  |
| `tests/fixtures/monorepo/packages/api/src` | This directory contains the implementation of the API server, which is responsible for starting the application and handling incoming requests. It serves as a central component in the service architecture of the monorepo.  |
| `tests/fixtures/monorepo/packages/shared` | This directory contains shared TypeScript types used across various packages in a monorepo setup, centralizing type definitions to promote consistency and reduce duplication.  |
| `tests/fixtures/monorepo/packages/shared/src` | This directory contains shared TypeScript types to be used across various packages in a monorepo setup. It centralizes type definitions to promote consistency and reduce duplication.  |
| `tests/fixtures/simple-project` | This directory contains a simple project demonstrating basic functionality with source files for a main function and a utility for adding numbers. It is structured to illustrate module usage and TypeScript configuration.   |
| `tests/fixtures/simple-project/src` | This directory contains the source files for a simple project, including a main function and a utility for adding numbers. It serves as the basic implementation for demonstrating functionality.  |
| `tests/fixtures/with-contextignore` | This directory serves as a collection of test fixture source files and temporary test fixtures specifically designed for unit testing. It ensures that test data is organized and isolated from the main application code, promoting clarity in the test suite.  |
| `tests/fixtures/with-contextignore/src` | This directory contains test fixture source files used for testing purposes. It is structured to allow for easy integration and utilization within test cases while maintaining isolation from the main application code.  |
| `tests/generator` | The tests/generator directory contains unit tests for validating the functionality of Markdown generation and manipulation specific to agent entries in the project. It ensures that generated content adheres to defined markers and formats correctly.  |
| `tests/mcp` | This directory contains tests for the MCP (Model Context Protocol) components, including server initialization and tool functionality. It ensures that the behavior of the MCP server and associated tools meet the expected outcomes defined in the specifications.  |
| `tests/utils` | The tests/utils directory contains utility test cases for functions related to concurrency management and token estimation within files and directories. It aims to ensure that utility functions behave as expected under various conditions.  |

### Maintenance

When you significantly change files in a directory, update its `.context.yaml`:
- Update `summary` if the directory's purpose shifted
- Update `decisions` if architectural choices changed
- Update `constraints` if hard rules changed

The `maintenance` field in each `.context.yaml` contains specific instructions.
<!-- dotcontext:agents-section-end -->
