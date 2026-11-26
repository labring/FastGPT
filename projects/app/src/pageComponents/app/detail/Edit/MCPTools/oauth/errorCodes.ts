import { MCP_OAUTH_ERROR_CODES } from '@fastgpt/global/core/app/tool/mcpTool/oauth';

/**
 * 用户可见错误码。
 *
 * 直接复用全局契约枚举，避免前端维护第二份清单发生漂移；
 * 错误码与用户文案在本文件集中维护，新增错误码需同步补齐各语言文案。
 *
 * 注意：scope allowlist 相关错误码已移除，禁止在本文件或任何前端代码中恢复。
 */
export const MCP_OAUTH_USER_FACING_ERROR_CODES = MCP_OAUTH_ERROR_CODES;

export type McpOAuthUserFacingErrorCode = (typeof MCP_OAUTH_USER_FACING_ERROR_CODES)[number];
