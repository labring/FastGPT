import { GET, POST } from '@/web/common/api/request';
import type {
  McpOAuthClientResetBodyType,
  McpOAuthClientResetResponseType,
  McpOAuthDisconnectBodyType,
  McpOAuthDisconnectResponseType,
  McpOAuthStartBodyType,
  McpOAuthStartResponseType,
  McpOAuthStatusQueryType,
  McpOAuthStatusResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/oauth';

/**
 * MCP OAuth 前端 API（I5 UI 使用）。
 *
 * 只封装 start/status/disconnect/client-reset；callback 由授权服务器直接跳转，
 * 前端不参与。
 */

/**
 * OAuth 路由直接返回裸 schema 响应（设计 §8.2/§8.3），错误仍走统一 envelope；
 * 因此跳过通用 `{code,data}` 解包，避免把成功响应当成空 data。
 */
const RAW_RESPONSE = { rawResponse: true } as const;

export const postStartMcpOAuth = (data: McpOAuthStartBodyType) =>
  POST<McpOAuthStartResponseType>('/core/app/mcpTools/oauth/start', data, RAW_RESPONSE);

export const getMcpOAuthStatus = (data: McpOAuthStatusQueryType) =>
  GET<McpOAuthStatusResponseType>('/core/app/mcpTools/oauth/status', data, RAW_RESPONSE);

export const postDisconnectMcpOAuth = (data: McpOAuthDisconnectBodyType) =>
  POST<McpOAuthDisconnectResponseType>('/core/app/mcpTools/oauth/disconnect', data, RAW_RESPONSE);

export const postResetMcpOAuthClient = (data: McpOAuthClientResetBodyType) =>
  POST<McpOAuthClientResetResponseType>(
    '/core/app/mcpTools/oauth/client/reset',
    data,
    RAW_RESPONSE
  );
