import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolType } from '@fastgpt/global/core/app/type';

export class MCPClient {
  private client: Client | null = null;
  private url: string;

  constructor(config: { url: string }) {
    this.url = config.url;
  }

  private async getConnection(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    try {
      const client = new Client({
        name: 'FastGPT-MCP-http-client',
        version: '1.0.0'
      });
      const transport = new StreamableHTTPClientTransport(new URL(this.url));
      await client.connect(transport);
      this.client = client;
      return client;
    } catch (error) {
      const client = new Client({
        name: 'FastGPT-MCP-sse-client',
        version: '1.0.0'
      });
      const sseTransport = new SSEClientTransport(new URL(this.url));
      await client.connect(sseTransport);
      this.client = client;
      return client;
    }
  }

  // 内部方法：关闭连接
  private async closeConnection() {
    if (this.client) {
      try {
        await this.client.close();
        this.client = null;
      } catch (error) {
        console.error('Failed to close MCP client:', error);
      }
    }
  }

  /**
   * Get available tools list
   * @returns List of tools
   */
  public async getTools(): Promise<ToolType[]> {
    try {
      const client = await this.getConnection();
      const response = await client.listTools();

      const tools = (response.tools || []).map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || {
          type: 'object',
          properties: {}
        }
      }));

      return tools;
    } catch (error) {
      console.error('Failed to get MCP tools:', error);
      return Promise.reject(error);
    } finally {
      await this.closeConnection();
    }
  }

  /**
   * Call tool
   * @param toolName Tool name
   * @param params Parameters
   * @returns Tool execution result
   */
  public async toolCall(toolName: string, params: Record<string, any>): Promise<any> {
    try {
      const client = await this.getConnection();
      console.log(`Call tool: ${toolName}`, params);

      const result = await client.callTool({
        name: toolName,
        arguments: params
      });

      return result;
    } catch (error) {
      console.error(`Failed to call tool ${toolName}:`, error);
      return Promise.reject(error);
    } finally {
      await this.closeConnection();
    }
  }
}

/**
 * Create MCP client
 * @param config Client configuration, containing url
 * @returns MCPClient instance
 */
export default function getMCPClient(config: { url: string }): MCPClient {
  return new MCPClient(config);
}
