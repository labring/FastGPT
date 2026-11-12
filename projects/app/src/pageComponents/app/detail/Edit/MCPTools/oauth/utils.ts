import dayjs from 'dayjs';
import type { McpOAuthStatus } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type { McpOAuthStatusResponseType } from '@fastgpt/global/openapi/core/app/mcpTools/oauth';

/**
 * MCP OAuth 前端纯逻辑（设计 §9）。
 *
 * 刻意不依赖 React / Chakra / 浏览器全局，便于在 vitest 中覆盖：
 * - 轮询判定（可见性 + 进行中状态 + 最长时长）
 * - scope 规范化（无 allowlist，空即不申请）
 * - 错误码提取与文案映射
 * - manual client 表单校验
 */

/** 进行中状态才轮询；终态不轮询（设计 §9.3）。 */
export const MCP_OAUTH_POLLING_STATES = [
  'pending_authorization',
  'refreshing',
  'refresh_due',
  'revoking'
] as const;

export type McpOAuthPollingState = (typeof MCP_OAUTH_POLLING_STATES)[number];

export const MCP_OAUTH_POLL_INTERVAL_MS = 5000;

/** 轮询最长 5 分钟；超时后停止，等待用户手动刷新（设计 §9.3）。 */
export const MCP_OAUTH_POLL_MAX_DURATION_MS = 5 * 60 * 1000;

export const isMcpOAuthPollingState = (state?: string | null): boolean =>
  !!state && (MCP_OAUTH_POLLING_STATES as readonly string[]).includes(state);

/** 页面可见 + 进行中状态 + 未超过最长时长才轮询；隐藏页/终态一律停止。 */
export const shouldPollMcpOAuthStatus = ({
  state,
  documentVisible,
  elapsedMs
}: {
  state?: string | null;
  documentVisible: boolean;
  elapsedMs?: number;
}): boolean => {
  if (!documentVisible || !isMcpOAuthPollingState(state)) return false;
  if (typeof elapsedMs === 'number' && elapsedMs >= MCP_OAUTH_POLL_MAX_DURATION_MS) return false;
  return true;
};

/** auto 模式的固定尝试顺序：CIMD → DCR → manual（不得调整）。 */
export const MCP_OAUTH_AUTO_CLIENT_MODE_ORDER = ['cimd', 'dcr', 'manual'] as const;
export type McpOAuthAutoStep = (typeof MCP_OAUTH_AUTO_CLIENT_MODE_ORDER)[number];

export type McpOAuthAutoStepState = 'done' | 'active' | 'skipped' | 'pending';

/** 依据 status 的实际 clientSource 推导 auto 链路展示进度，不臆造已尝试步骤。 */
export const getMcpOAuthAutoStepStates = ({
  clientSource
}: {
  clientSource?: 'cimd' | 'dcr' | 'manual' | null;
}): { step: McpOAuthAutoStep; state: McpOAuthAutoStepState }[] => {
  if (clientSource === 'cimd') {
    return [
      { step: 'cimd', state: 'done' },
      { step: 'dcr', state: 'pending' },
      { step: 'manual', state: 'pending' }
    ];
  }
  if (clientSource === 'dcr') {
    return [
      { step: 'cimd', state: 'skipped' },
      { step: 'dcr', state: 'done' },
      { step: 'manual', state: 'pending' }
    ];
  }
  if (clientSource === 'manual') {
    return [
      { step: 'cimd', state: 'skipped' },
      { step: 'dcr', state: 'skipped' },
      { step: 'manual', state: 'done' }
    ];
  }
  return [
    { step: 'cimd', state: 'active' },
    { step: 'dcr', state: 'pending' },
    { step: 'manual', state: 'pending' }
  ];
};

/**
 * scope 按空格分隔、去重、保序；空值即空集。
 *
 * v2.4 没有全局 allowlist：这里只做 RFC 6749 语法层面的空白/去重归一化，
 * 不添加、不预填、不静默申请任何 scope。
 */
export const normalizeMcpOAuthScope = (input?: string | string[] | null): string => {
  const raw = Array.isArray(input) ? input.join(' ') : (input ?? '');
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of raw.split(/\s+/)) {
    const value = token.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    tokens.push(value);
  }
  return tokens.join(' ');
};

export const parseMcpOAuthScopeList = (input?: string | string[] | null): string[] => {
  const normalized = normalizeMcpOAuthScope(input);
  return normalized ? normalized.split(' ') : [];
};

/** 勾选/取消一个 scope 候选；返回规范化后的字符串。 */
export const toggleMcpOAuthScope = (current: string | undefined, token: string): string => {
  const normalizedToken = token.trim();
  if (!normalizedToken) return normalizeMcpOAuthScope(current);
  const tokens = parseMcpOAuthScopeList(current);
  const next = tokens.includes(normalizedToken)
    ? tokens.filter((item) => item !== normalizedToken)
    : [...tokens, normalizedToken];
  return normalizeMcpOAuthScope(next);
};

/**
 * scope 候选仅来自 AS/PRM 的 `scopes_supported` 与 status 的已请求/已授予值，
 * 默认不勾选，仅作为输入辅助。
 */
export const buildMcpOAuthScopeCandidates = ({
  scopesSupported,
  requestedScope,
  grantedScope
}: {
  scopesSupported?: string[] | null;
  requestedScope?: string | null;
  grantedScope?: string | null;
}): string[] => {
  const candidates = [
    ...(scopesSupported ?? []),
    ...parseMcpOAuthScopeList(requestedScope),
    ...parseMcpOAuthScopeList(grantedScope)
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of candidates) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

export type McpOAuthManualAuthMethod = 'none' | 'client_secret_post' | 'client_secret_basic';

export const MCP_OAUTH_MANUAL_AUTH_METHODS: readonly McpOAuthManualAuthMethod[] = [
  'none',
  'client_secret_post',
  'client_secret_basic'
];

export const MCP_OAUTH_MANUAL_CLIENT_REQUIRED_CODES = [
  'mcp_oauth_client_missing',
  'mcp_oauth_client_required'
] as const;

export const isMcpOAuthManualClientRequiredCode = (code?: string | null): boolean =>
  !!code && (MCP_OAUTH_MANUAL_CLIENT_REQUIRED_CODES as readonly string[]).includes(code);

/** manual 表单在校验失败时返回 i18n key；通过时返回规范化后的 client。 */
export const validateMcpOAuthManualClient = (input: {
  clientId?: string | null;
  clientSecret?: string | null;
  tokenEndpointAuthMethod?: string | null;
}): {
  ok: boolean;
  errorKey?: string;
  value?: {
    clientId: string;
    clientSecret?: string;
    tokenEndpointAuthMethod: McpOAuthManualAuthMethod;
  };
} => {
  const clientId = (input.clientId ?? '').trim();
  const clientSecret = (input.clientSecret ?? '').trim();
  const authMethod = input.tokenEndpointAuthMethod ?? 'client_secret_basic';

  if (!clientId) {
    return { ok: false, errorKey: 'mcpOAuth.manual_client_id_required' };
  }
  if (!(MCP_OAUTH_MANUAL_AUTH_METHODS as readonly string[]).includes(authMethod)) {
    return { ok: false, errorKey: 'mcpOAuth.manual_auth_method_invalid' };
  }
  if (authMethod !== 'none' && !clientSecret) {
    return { ok: false, errorKey: 'mcpOAuth.manual_client_secret_required' };
  }

  return {
    ok: true,
    value: {
      clientId,
      ...(clientSecret ? { clientSecret } : {}),
      tokenEndpointAuthMethod: authMethod as McpOAuthManualAuthMethod
    }
  };
};

export const shouldShowMcpOAuthManualForm = ({
  clientMode,
  errorCode,
  manuallyOpened
}: {
  clientMode: string;
  errorCode?: string | null;
  manuallyOpened?: boolean;
}): boolean =>
  clientMode === 'manual' || !!manuallyOpened || isMcpOAuthManualClientRequiredCode(errorCode);

type ErrorEnvelopeLike = {
  data?: { oauthCode?: unknown; mcpOAuthCode?: unknown } | null;
  response?: { data?: unknown } | null;
  oauthCode?: unknown;
};

/** 从统一错误 envelope 中提取稳定的 oauthCode（`data.oauthCode` 优先）。 */
export const getMcpOAuthErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const direct = error as ErrorEnvelopeLike;
  const responseData = direct.response?.data as ErrorEnvelopeLike | undefined;
  const candidates = [
    direct.data?.oauthCode,
    direct.data?.mcpOAuthCode,
    direct.oauthCode,
    responseData?.data?.oauthCode,
    responseData?.oauthCode
  ];
  return candidates.find((item): item is string => typeof item === 'string' && item.length > 0);
};

export type McpOAuthTranslate = (key: string, options?: Record<string, unknown>) => string;

const readTranslation = (
  t: McpOAuthTranslate,
  key: string,
  options?: Record<string, unknown>
): string => {
  const value = t(key, options);
  // i18next 缺键时原样返回 key；按“无文案”处理，避免把 key 当成提示展示。
  return typeof value === 'string' && value !== key ? value : '';
};

/** 按 v2.4 §8.3 映射用户文案与建议操作；未知码降级为通用文案 + 错误码。 */
export const getMcpOAuthErrorCopy = (
  code: string | undefined | null,
  t: McpOAuthTranslate
): { code?: string; message: string; suggestion: string } => {
  if (!code) {
    return {
      message: readTranslation(t, 'mcpOAuth.error_unknown_no_code'),
      suggestion: ''
    };
  }

  const message = readTranslation(t, `mcpOAuth.error.${code}`);
  const suggestion = readTranslation(t, `mcpOAuth.errorSuggestion.${code}`);
  if (message) {
    return {
      code,
      message,
      suggestion: suggestion || readTranslation(t, 'mcpOAuth.errorSuggestion.unknown')
    };
  }

  return {
    code,
    message: readTranslation(t, 'mcpOAuth.error_unknown', { code }),
    suggestion: readTranslation(t, 'mcpOAuth.errorSuggestion.unknown')
  };
};

/** status.state 的 8 种取值；未知状态降级为 config_error 文案，避免空白。 */
export const MCP_OAUTH_STATUS_STATES: readonly McpOAuthStatus[] = [
  'headers',
  'config_error',
  'client_missing',
  'pending_authorization',
  'authorized',
  'refresh_due',
  'refreshing',
  'reauth_required'
];

export const getMcpOAuthStateI18nKey = (state?: string | null): string => {
  const resolved =
    state && (MCP_OAUTH_STATUS_STATES as readonly string[]).includes(state)
      ? state
      : 'config_error';
  return `mcpOAuth.state.${resolved}`;
};

export const formatMcpOAuthTime = (value?: number | null): string =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? dayjs(value).format('YYYY-MM-DD HH:mm:ss')
    : '-';

export type McpOAuthCallbackQuery = {
  oauth?: string | string[] | null;
  code?: string | string[] | null;
};

const firstQueryValue = (value?: string | string[] | null): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * 解析回调落地参数。
 *
 * 成功只认 `oauth=success`；`oauth=error` 必须带 `code` 才展示具体文案，
 * 否则按未知错误处理。返回值同时用于清理 query。
 */
export const parseMcpOAuthCallbackQuery = (
  query: McpOAuthCallbackQuery
): { kind: 'success' } | { kind: 'error'; code?: string } | null => {
  const oauth = firstQueryValue(query.oauth);
  if (oauth === 'success') return { kind: 'success' };
  if (oauth === 'error') return { kind: 'error', code: firstQueryValue(query.code) };
  return null;
};

/** 规范化 start 请求体：scope 空值不发送，manual 只在用户提供 clientId 时携带。 */
export const buildMcpOAuthStartBody = ({
  appId,
  nodeId,
  clientMode,
  scope,
  manualClient
}: {
  appId: string;
  nodeId?: string;
  clientMode: 'auto' | 'cimd' | 'dcr' | 'manual';
  scope?: string;
  manualClient?: {
    clientId: string;
    clientSecret?: string;
    tokenEndpointAuthMethod: McpOAuthManualAuthMethod;
  };
}): {
  appId: string;
  nodeId?: string;
  clientMode: 'auto' | 'cimd' | 'dcr' | 'manual';
  scope?: string;
  manualClient?: {
    clientId: string;
    clientSecret?: string;
    tokenEndpointAuthMethod: McpOAuthManualAuthMethod;
  };
} => {
  const normalizedScope = normalizeMcpOAuthScope(scope);
  return {
    appId,
    ...(nodeId ? { nodeId } : {}),
    clientMode,
    ...(normalizedScope ? { scope: normalizedScope } : {}),
    ...(manualClient && manualClient.clientId
      ? {
          manualClient: {
            clientId: manualClient.clientId,
            ...(manualClient.clientSecret ? { clientSecret: manualClient.clientSecret } : {}),
            tokenEndpointAuthMethod: manualClient.tokenEndpointAuthMethod
          }
        }
      : {})
  };
};

/** status 是否允许开始授权；缺 status 时按可开始处理（首次进入页面）。 */
export const canStartMcpOAuth = ({
  status,
  canManage
}: {
  status?: Pick<McpOAuthStatusResponseType, 'canStart'> | null;
  canManage: boolean;
}): boolean => canManage && (status?.canStart ?? true);
