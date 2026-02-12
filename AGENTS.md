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
| `src` | The \`src\` directory serves as the main entry point for the application, encapsulating the command-line interface (CLI) functionality, core processing logic, and utility functions essential for managing and generating .context.yaml files for project documentation. It orchestrates various commands that allow users to configure, monitor, and validate project states.  |
| `src/commands` | The \`src/commands\` directory houses various command-line interface (CLI) commands that facilitate configuration management, context generation, checks, validation, and monitoring of the project structure. Each command allows users to interact with context files and project configurations, ensuring the integrity and accuracy of the developed system.  |
| `src/core` | This directory contains core functionality for computing directory fingerprints, scanning project structures, and managing .context.yaml files. It ensures organized and efficient tracking of project files and their states.  |
| `src/generator` | The \`src/generator\` directory contains code for parsing source files to detect exports and dependencies, generating context documentation, and collecting evidence from existing artifacts. It leverages AST parsing and static analysis to build structured YAML outputs for project documentation.  |
| `src/mcp` | The \`src/mcp\` directory implements the Model Context Protocol (MCP) server, providing functionality to manage and query project context stored in \`.context.yaml\` files. It establishes a connection via standard I/O and allows interaction with the context through various tools.  |
| `src/providers` | This directory implements various LLM provider classes that adhere to a common interface, allowing for the generation of text responses from different language models. Each provider encapsulates the specifics of interacting with an external API or SDK.   |
| `src/utils` | The src/utils directory provides utility functions to manage configuration settings, environment variables, and display messages. It includes methods for loading and saving configurations, handling environment variables, and processing data in parallel with bounded concurrency.  |
| `tests` | The tests directory contains various unit tests to validate the functionality and behavior of the application, including components such as command handlers, core functionality, dependency detection, environmental variable management, and code generation. It ensures the integrity and reliability of the system through comprehensive testing across different modules.  |
| `tests/commands` | This directory contains various test files for validating the functionality of command handlers. Each test file verifies specific commands related to configuration, status, initialization, watching, and more within the application.  |
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
| `tests/fixtures/with-contextignore/tmp` | This directory contains temporary test fixtures specifically used for unit testing within the project. It aids in separating test data from the main test suite for clarity and organization.  |
| `tests/generator` | The tests/generator directory contains unit tests for validating the functionality of Markdown generation and manipulation specific to agent entries in the project. It ensures that generated content adheres to defined markers and formats correctly.  |
| `tests/mcp` | This directory contains tests for the MCP (Model Context Protocol) components, including server initialization and tool functionality. It ensures that the behavior of the MCP server and associated tools meet the expected outcomes defined in the specifications.  |
| `tests/utils` | This directory contains utility tests that validate the behavior of helper functions, such as concurrency management and token estimation from file sizes. These tests ensure correctness and performance of utility methods used throughout the codebase.  |

### Maintenance

When you significantly change files in a directory, update its `.context.yaml`:
- Update `summary` if the directory's purpose shifted
- Update `decisions` if architectural choices changed
- Update `constraints` if hard rules changed

The `maintenance` field in each `.context.yaml` contains specific instructions.
<!-- dotcontext:agents-section-end -->
