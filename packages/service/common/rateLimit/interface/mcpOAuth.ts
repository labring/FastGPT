import { createHash } from 'node:crypto';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { defineRateLimitInterface } from '../core';
import { RateLimitSceneEnum } from '../type';

/**
 * MCP OAuth 路由限流（v2.4 §3.3）。
 *
 * 所有策略均通过 `defineRateLimitInterface` 声明，key 只由服务端解析出的
 * appId / tmbId / IP 组成；IP 先做 sha256，避免把原始地址写进 Redis key。
 */

/** 与设计中的 `ip/<sha256(ip)>` 对齐；空 IP 由调用方在路由层跳过，禁止共享空桶。 */
export const getMcpOAuthIpRateLimitSegment = (ip: string): string => {
  if (!ip) {
    throw new Error('MCP OAuth IP rate limit requires a non-empty client IP');
  }
  return createHash('sha256').update(ip).digest('hex');
};

/** 单应用每分钟最多发起 5 次授权。 */
export const mcpOAuthStartByAppRateLimit = defineRateLimitInterface<{ appId: string }>({
  scene: RateLimitSceneEnum.McpOAuth,
  policy: 'start-app',
  failureMode: 'closed',
  getKeySegments: ({ appId }) => ['app', appId],
  getLimit: () => 5,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 单成员每分钟最多发起 20 次授权。 */
export const mcpOAuthStartByUserRateLimit = defineRateLimitInterface<{ tmbId: string }>({
  scene: RateLimitSceneEnum.McpOAuth,
  policy: 'start-user',
  failureMode: 'closed',
  getKeySegments: ({ tmbId }) => ['user', tmbId],
  getLimit: () => 20,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 回调在解密 state 前按 IP 限流；Redis 故障放行，由一次性台账兜底。 */
export const mcpOAuthCallbackByIpRateLimit = defineRateLimitInterface<{ ip: string }>({
  scene: RateLimitSceneEnum.McpOAuth,
  policy: 'callback-ip',
  failureMode: 'open',
  getKeySegments: ({ ip }) => ['ip', getMcpOAuthIpRateLimitSegment(ip)],
  getLimit: () => 30,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 回调按已解密 state 中的 appId 限流。 */
export const mcpOAuthCallbackByAppRateLimit = defineRateLimitInterface<{ appId: string }>({
  scene: RateLimitSceneEnum.McpOAuth,
  policy: 'callback-app',
  failureMode: 'closed',
  getKeySegments: ({ appId }) => ['app', appId],
  getLimit: () => 60,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 断开授权。 */
export const mcpOAuthDisconnectByAppRateLimit = defineRateLimitInterface<{ appId: string }>({
  scene: RateLimitSceneEnum.McpOAuth,
  policy: 'disconnect-app',
  failureMode: 'closed',
  getKeySegments: ({ appId }) => ['app', appId],
  getLimit: () => 5,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 重置 client。 */
export const mcpOAuthClientResetByAppRateLimit = defineRateLimitInterface<{ appId: string }>({
  scene: RateLimitSceneEnum.McpOAuth,
  policy: 'client-reset-app',
  failureMode: 'closed',
  getKeySegments: ({ appId }) => ['app', appId],
  getLimit: () => 5,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});

/** 公开 CIMD 文档；Redis 故障放行，静态文档无副作用。 */
export const mcpOAuthClientMetadataByIpRateLimit = defineRateLimitInterface<{ ip: string }>({
  scene: RateLimitSceneEnum.McpOAuth,
  policy: 'client-metadata-ip',
  failureMode: 'open',
  getKeySegments: ({ ip }) => ['ip', getMcpOAuthIpRateLimitSegment(ip)],
  getLimit: () => 60,
  getWindowSeconds: () => 60,
  createError: () => ERROR_ENUM.tooManyRequest
});

export const assertMcpOAuthStartByAppRateLimit = mcpOAuthStartByAppRateLimit.assert;
export const assertMcpOAuthStartByUserRateLimit = mcpOAuthStartByUserRateLimit.assert;
export const assertMcpOAuthCallbackByIpRateLimit = mcpOAuthCallbackByIpRateLimit.assert;
export const assertMcpOAuthCallbackByAppRateLimit = mcpOAuthCallbackByAppRateLimit.assert;
export const assertMcpOAuthDisconnectByAppRateLimit = mcpOAuthDisconnectByAppRateLimit.assert;
export const assertMcpOAuthClientResetByAppRateLimit = mcpOAuthClientResetByAppRateLimit.assert;
export const assertMcpOAuthClientMetadataByIpRateLimit = mcpOAuthClientMetadataByIpRateLimit.assert;
