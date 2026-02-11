import { describe, it, expect, vi, beforeEach } from "vitest";

const registerTools = vi.fn();
const connect = vi.fn(async () => {});
const mockServer = { connect };
const McpServer = vi.fn(function MockMcpServer() {
  return mockServer;
});
const StdioServerTransport = vi.fn(function MockStdioServerTransport() {
  return { transport: "stdio" };
});

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer,
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport,
}));

vi.mock("../../src/mcp/tools.js", () => ({
  registerTools,
}));

const { startMcpServer } = await import("../../src/mcp/server.js");

describe("startMcpServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates server, registers tools, and connects stdio transport", async () => {
    await startMcpServer("/tmp/project");

    expect(McpServer).toHaveBeenCalledWith({ name: "dotcontext", version: "0.1.0" });
    expect(registerTools).toHaveBeenCalledWith(mockServer, "/tmp/project");
    expect(StdioServerTransport).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
