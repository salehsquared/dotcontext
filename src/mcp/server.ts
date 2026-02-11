import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

export async function startMcpServer(rootPath: string): Promise<void> {
  const server = new McpServer({
    name: "dotcontext",
    version: "0.1.0",
  });

  registerTools(server, rootPath);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr — stdout is the JSON-RPC channel
  console.error("[dotcontext] MCP server started");
  console.error(`[dotcontext] Project root: ${rootPath}`);
}
