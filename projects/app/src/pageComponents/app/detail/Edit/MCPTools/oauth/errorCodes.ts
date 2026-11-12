import { MCP_OAUTH_ERROR_CODES } from '@fastgpt/global/core/app/tool/mcpTool/oauth';

/**
 * v2.4 用户可见错误码（设计 §8.3）。
 *
 * 直接复用全局契约枚举，避免前端维护第二份清单发生漂移；
 * `scripts/mcp-oauth-i18n-check.mjs` 会校验这里列出的每个码在四语言中都有文案。
 *
 * 注意：v2.4 已删除 scope allowlist 相关错误码，禁止在本文件或任何前端代码中恢复。
 */
export const MCP_OAUTH_USER_FACING_ERROR_CODES = MCP_OAUTH_ERROR_CODES;

export type McpOAuthUserFacingErrorCode = (typeof MCP_OAUTH_USER_FACING_ERROR_CODES)[number];
