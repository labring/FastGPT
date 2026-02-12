import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { type McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { MongoApp } from './schema';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { getLogger, LogCategories } from '../../common/logger';

const logger = getLogger(LogCategories.MODULE.APP.MCP_TOOLS);

export class MCPClient {
  private client: Client;
  private url: string;
  private headers: Record<string, any> = {};

  constructor(config: { url: string; headers: Record<string, any> }) {
    this.url = config.url;
    this.headers = config.headers;
    this.client = new Client({
      name: 'FastGPT-MCP-client',
      version: '1.0.0'
    });
  }

  private async getConnection(): Promise<Client> {
    try {
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        requestInit: {
          headers: this.headers
        }
      });
      await this.client.connect(transport);
      return this.client;
    } catch (error) {
      await this.client.connect(
        new SSEClientTransport(new URL(this.url), {
          requestInit: {
            headers: this.headers
          },
          eventSourceInit: {
            fetch: (url, init) => {
              const mergedHeaders: Record<string, string> = {
                ...this.headers
              };

              if (init?.headers) {
                if (init.headers instanceof Headers) {
                  init.headers.forEach((value, key) => {
                    mergedHeaders[key] = value;
                  });
                } else if (typeof init.headers === 'object') {
                  Object.assign(mergedHeaders, init.headers);
                }
              }

              return fetch(url, {
                ...init,
                headers: mergedHeaders
              });
            }
          }
        })
      );
      return this.client;
    }
  }

  // 内部方法：关闭连接
  async closeConnection() {
    try {
      await retryFn(() => this.client.close(), 3);
      logger.debug('MCP client connection closed', { url: this.url });
    } catch (error) {
      logger.error('MCP client failed to close connection', { url: this.url, error });
    }
  }

  /**
   * Get available tools list
   * @returns List of tools
   */
  public async getTools(): Promise<McpToolConfigType[]> {
    try {
      const client = await this.getConnection();
      const response = await client.listTools();

      if (!Array.isArray(response.tools)) {
        return Promise.reject(new UserError('[MCP Client] Get tools response is not an array'));
      }

      const tools = await Promise.all(
        response.tools.map(async (tool) => {
          let processedSchema;

          if (tool.inputSchema) {
            try {
              // Deep clone to avoid dereference() mutating the original object
              const schemaClone = JSON.parse(JSON.stringify(tool.inputSchema));
              processedSchema = await $RefParser.dereference(schemaClone, {
                resolve: {
                  // Disable file and HTTP $ref resolution to prevent SSRF
                  file: false,
                  http: false
                }
              });
            } catch (error) {
              logger.error(`Failed to dereference schema for tool "${tool.name}":`, { error });
              processedSchema = tool.inputSchema;
            }
          }

          return {
            name: tool.name,
            description: tool.description || '',
            inputSchema: processedSchema
              ? {
                  type: 'object',
                  ...processedSchema,
                  properties: processedSchema.properties || {}
                }
              : {
                  type: 'object',
                  properties: {}
                }
          };
        })
      );

      // @ts-ignore
      return tools;
    } catch (error) {
      logger.error('MCP client failed to get tools', { url: this.url, error });
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
  public async toolCall({
    toolName,
    params,
    closeConnection = true
  }: {
    toolName: string;
    params: Record<string, any>;
    closeConnection?: boolean;
  }): Promise<any> {
    try {
      const client = await this.getConnection();
      logger.debug('MCP client calling tool', { url: this.url, toolName, params });

      return await client.callTool(
        {
          name: toolName,
          arguments: params
        },
        undefined,
        {
          timeout: 300000
        }
      );
    } catch (error) {
      logger.error('MCP client tool call failed', { url: this.url, toolName, error });
      return Promise.reject(error);
    } finally {
      if (closeConnection) {
        await this.closeConnection();
      }
    }
  }
}

export const getMCPChildren = async (app: AppSchemaType) => {
  const isNewMcp = !!app.modules[0].toolConfig?.mcpToolSet;
  const id = String(app._id);

  if (isNewMcp) {
    return (
      app.modules[0].toolConfig?.mcpToolSet?.toolList.map((item) => ({
        ...item,
        id: `${AppToolSourceEnum.mcp}-${id}/${item.name}`,
        avatar: app.avatar
      })) ?? []
    );
  } else {
    // Old mcp toolset
    const children = await MongoApp.find({
      teamId: app.teamId,
      parentId: id
    }).lean();

    return children.map((item) => {
      const node = item.modules[0];
      const toolData: McpToolDataType = node.inputs[0].value;

      return {
        avatar: app.avatar,
        id: `${AppToolSourceEnum.mcp}-${id}/${item.name}`,
        ...toolData
      };
    });
  }
};
