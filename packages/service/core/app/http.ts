import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { MongoApp } from './schema';
import type { HttpToolDataType } from '@fastgpt/global/core/app/httpPlugin/type';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../common/system/log';
import { type HttpToolConfigType } from '@fastgpt/global/core/app/type';
import axios from 'axios';

export class HTTPClient {
  private client: Client;
  private url: string;
  private headers: Record<string, any> = {};

  constructor(config: { url: string; headers: Record<string, any> }) {
    this.url = config.url;
    this.headers = config.headers;
    this.client = new Client({
      name: 'FastGPT-HTTP-client',
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
              const headers = new Headers({
                ...init?.headers,
                ...this.headers
              });

              return fetch(url, {
                ...init,
                headers
              });
            }
          }
        })
      );
      return this.client;
    }
  }

  // 内部方法：关闭连接
  private async closeConnection() {
    try {
      await retryFn(() => this.client.close(), 3);
    } catch (error) {
      addLog.error('[HTTP Client] Failed to close connection:', error);
    }
  }

  /**
   * Get available tools list
   * @returns List of tools
   */
  public async getTools(): Promise<HttpToolConfigType[]> {
    try {
      const client = await this.getConnection();
      const response = await client.listTools();

      if (!Array.isArray(response.tools)) {
        return Promise.reject('[HTTP Client] Get tools response is not an array');
      }

      const tools = response.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema
          ? {
              ...tool.inputSchema,
              properties: tool.inputSchema.properties || {}
            }
          : {
              type: 'object',
              properties: {}
            }
      }));

      // @ts-ignore
      return tools;
    } catch (error) {
      addLog.error('[HTTP Client] Failed to get tools:', error);
      return Promise.reject(error);
    } finally {
      await this.closeConnection();
    }
  }

  /**
   * Call tool using simple HTTP request (alternative to MCP protocol)
   * @param toolName Tool name
   * @param params Parameters
   * @param toolPath Tool path (e.g., "/pet/{petId}")
   * @param method HTTP method (e.g., "GET", "POST")
   * @returns Tool execution result
   */
  public async toolCallSimple(
    toolName: string,
    params: Record<string, any>,
    toolPath?: string,
    method: string = 'POST'
  ): Promise<any> {
    try {
      addLog.debug(`[HTTP Client] Call tool (simple): ${toolName}`, params);

      let toolUrl: string;

      if (toolPath) {
        toolUrl = this.buildUrlWithPathParams(toolPath, params);
      } else {
        toolUrl = `${this.url}`;
      }

      const { pathParams, bodyParams, queryParams } = this.separateParams(params, toolPath);

      const response = await axios({
        method: method.toUpperCase(),
        url: toolUrl,
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        data: Object.keys(bodyParams).length > 0 ? bodyParams : undefined,
        params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        timeout: 300000,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false
        })
      });

      return {
        content: [
          {
            type: 'text',
            text: response.data
          }
        ],
        isError: false
      };
    } catch (error: any) {
      addLog.error(`[HTTP Client] Failed to call tool (simple) ${toolName}:`, error);
      return {
        content: [],
        isError: true,
        message: error.response?.data?.message || error.message || 'HTTP request failed'
      };
    }
  }

  private buildUrlWithPathParams(path: string, params: Record<string, any>): string {
    let url = `${this.url}${path}`;

    Object.keys(params).forEach((paramName) => {
      const placeholder = `{${paramName}}`;
      if (url.includes(placeholder)) {
        url = url.replace(placeholder, encodeURIComponent(params[paramName]));
      }
    });

    return url;
  }

  private separateParams(params: Record<string, any>, toolPath?: string) {
    const pathParams: Record<string, any> = {};
    const queryParams: Record<string, any> = {};
    const bodyParams: Record<string, any> = { ...params };

    if (toolPath) {
      const pathParamMatches = toolPath.match(/\{([^}]+)\}/g);
      if (pathParamMatches) {
        pathParamMatches.forEach((match) => {
          const paramName = match.slice(1, -1);
          if (params[paramName] !== undefined) {
            pathParams[paramName] = params[paramName];
            delete bodyParams[paramName];
          }
        });
      }
    }

    return { pathParams, queryParams, bodyParams };
  }
}

export const getHTTPChildren = async (app: AppSchema) => {
  const isNewMcp = !!app.modules[0].toolConfig?.httpToolSet;
  const id = String(app._id);

  if (isNewMcp) {
    return (
      app.modules[0].toolConfig?.httpToolSet?.toolList.map((item) => ({
        ...item,
        id: `${PluginSourceEnum.http}-${id}/${item.name}`,
        avatar: app.avatar
      })) ?? []
    );
  } else {
    const children = await MongoApp.find({
      teamId: app.teamId,
      parentId: id
    }).lean();

    return children.map((item) => {
      const node = item.modules[0];
      const toolData: HttpToolDataType = node.inputs[0].value;

      return {
        avatar: app.avatar,
        id: `${PluginSourceEnum.http}-${id}/${item.name}`,
        ...toolData
      };
    });
  }
};
