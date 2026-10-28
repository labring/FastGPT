import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { callMcpServerTool, getMcpServerTools } from '@/service/support/mcp/utils';
import { type toolCallProps } from '@/service/support/mcp/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getMcpAuthProxyFromHeaders } from '@/service/support/mcp/auth';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { withHttpRequestProfile } from '@fastgpt/service/common/http/requestProfile';
import { isProfiling, markProfileError } from '@fastgpt/service/common/profiling';
const logger = getLogger(LogCategories.MODULE.MCP.APP);

const mcpExpectedClientErrors = new Set<string>([
  TeamErrEnum.accountCancellationPending,
  UserErrEnum.accountCancellationPending,
  CommonErrEnum.invalidResource
]);

/**
 * 识别预期内的客户端错误：注销流程中，或使用了无效/已删除的 MCP 访问 key。
 * 两者都由客户端侧状态决定，不是服务端异常；其余错误继续按未知异常处理。
 *
 * 两种错误的抛出形态不同：注销守卫抛 `new Error(枚举值)`，
 * 而 key 不存在时是 `Promise.reject(裸字符串)`，因此这里同时接受 Error 与字符串。
 */
const isMcpExpectedClientError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : error;
  return typeof message === 'string' && mcpExpectedClientErrors.has(message);
};

const getMcpRequestId = (body: unknown): string | number | undefined => {
  if (typeof body !== 'object' || body === null || !('id' in body)) return undefined;

  const id = body.id;
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
};

export type mcpQuery = { key: string };

export type mcpBody = toolCallProps;

/**
 * 补全 SDK 自行生成的错误响应的失败标记。
 *
 * MCP SDK 会把协议与参数错误直接写成响应而不抛异常：Accept 不完整时返回 406，
 * `tools/call` 缺少 `params.name` 等参数校验失败时返回 200 + SSE 内的 JSON-RPC error。
 * 这些情况都不会进入业务 catch，若不额外观测，失败请求会以 `status=ok` 进入直方图。
 *
 * - 包装 `transport.send`：SDK 生成的 JSON-RPC error 都经由它发送（覆盖 HTTP 200 的情况）；
 * - `handleRequest` 返回后检查 HTTP 状态码，覆盖 406 这类 transport 自行返回、不经过 send 的响应。
 *
 * 只做失败标记，不改变任何响应内容与状态码。
 */
const observeMcpTransportErrors = (transport: StreamableHTTPServerTransport) => {
  if (!isProfiling()) return;

  const originalSend = transport.send.bind(transport);
  transport.send = (message, options) => {
    if ('error' in message && message.error) {
      markProfileError(message.error.message || 'MCP JSON-RPC error');
    }
    return originalSend(message, options);
  };
};

const handlePost = async (req: ApiRequestProps<mcpBody, mcpQuery>, res: ApiResponseType<any>) => {
  const key = req.query.key;
  const server = new Server(
    {
      name: 'fastgpt-mcp-server-http-streamable',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  observeMcpTransportErrors(transport);
  res.on('close', () => {
    logger.debug('[MCP server] Close connection');
    transport.close();
    server.close();
  });

  try {
    const tools = await getMcpServerTools(key);
    // Register list tools
    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools
    }));

    // Register call tool
    const handleToolCall = async (
      name: string,
      args: Record<string, any>
    ): Promise<CallToolResult> => {
      try {
        logger.debug(`Call tool: ${name} with args: ${JSON.stringify(args)}`);
        const authProxy = getMcpAuthProxyFromHeaders(req.headers);
        const result = await callMcpServerTool({ key, toolName: name, inputs: args, authProxy });

        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result)
            }
          ],
          isError: false
        };
      } catch (error) {
        markProfileError(error);
        return {
          content: [
            {
              type: 'text',
              text: getErrText(error)
            }
          ],
          message: getErrText(error),
          isError: true
        };
      }
    };
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return handleToolCall(request.params.name, request.params.arguments ?? {});
    });

    // Connect to transport
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    // transport 自行返回的协议错误（如 Accept 不完整时的 406）不会抛异常，按状态码补标。
    if (res.statusCode >= 400) {
      markProfileError(`MCP responded ${res.statusCode}`);
    }
  } catch (error) {
    markProfileError(error);
    const isExpectedClientError = isMcpExpectedClientError(error);
    if (isExpectedClientError) {
      // 预期内的客户端错误（无效 key、注销中）：降级为 warn，避免污染服务端 error 指标
      logger.warn('[MCP server] MCP request rejected:', { error });
    } else {
      logger.error('[MCP server] Error handling MCP request:', { error });
    }

    if (!res.writableFinished) {
      if (isExpectedClientError) {
        // transport 尚未处理请求时，直接回传原请求 id，客户端才能将错误与请求匹配。
        const requestId = getMcpRequestId(req.body);
        res.status(200).json({
          jsonrpc: '2.0',
          ...(requestId === undefined ? {} : { id: requestId }),
          error: {
            code: -32000,
            message: getErrText(error)
          }
        });
        return;
      }

      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
};

async function handleMcpRequest(
  req: ApiRequestProps<mcpBody, mcpQuery>,
  res: ApiResponseType<any>
) {
  const method = req.method;

  if (method === 'POST') {
    return handlePost(req, res);
  }

  markProfileError();
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.'
      },
      id: null
    })
  );
  return;
}

/** 原生 MCP 不经过 NextAPI；复用相同的按 header 开启的观测层，保持 JSON-RPC 响应。 */
async function handler(req: ApiRequestProps<mcpBody, mcpQuery>, res: ApiResponseType<any>) {
  return withHttpRequestProfile({ headers: req.headers, kind: 'mcp' }, () =>
    handleMcpRequest(req, res)
  );
}

export default handler;
