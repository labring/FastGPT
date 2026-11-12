import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_OAUTH_USER_FACING_ERROR_CODES } from '@/pageComponents/app/detail/Edit/MCPTools/oauth/errorCodes';
import {
  MCP_OAUTH_POLL_INTERVAL_MS,
  MCP_OAUTH_POLL_MAX_DURATION_MS,
  MCP_OAUTH_STATUS_STATES,
  buildMcpOAuthScopeCandidates,
  buildMcpOAuthStartBody,
  getMcpOAuthAutoStepStates,
  getMcpOAuthErrorCode,
  getMcpOAuthErrorCopy,
  getMcpOAuthStateI18nKey,
  isMcpOAuthPollingState,
  normalizeMcpOAuthScope,
  parseMcpOAuthCallbackQuery,
  parseMcpOAuthScopeList,
  shouldPollMcpOAuthStatus,
  shouldShowMcpOAuthManualForm,
  toggleMcpOAuthScope,
  validateMcpOAuthManualClient,
  type McpOAuthTranslate
} from '@/pageComponents/app/detail/Edit/MCPTools/oauth/utils';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');

const dictionary: Record<string, string> = {
  'mcpOAuth.error.mcp_oauth_reauth_required': '需要重新授权',
  'mcpOAuth.errorSuggestion.mcp_oauth_reauth_required': '点击「去授权」重新授权',
  'mcpOAuth.error_unknown': '未知错误（{{code}}）',
  'mcpOAuth.error_unknown_no_code': '发生未知错误',
  'mcpOAuth.errorSuggestion.unknown': '请联系管理员'
};
const t: McpOAuthTranslate = (key, options) => {
  const value = dictionary[key] ?? key;
  return value.replace('{{code}}', String(options?.code ?? ''));
};

describe('MCP OAuth scope 规范化（无 allowlist）', () => {
  it('去重、保序、去首尾空白；空输入为空', () => {
    expect(normalizeMcpOAuthScope('  read   write read  ')).toBe('read write');
    expect(normalizeMcpOAuthScope('')).toBe('');
    expect(normalizeMcpOAuthScope(undefined)).toBe('');
    expect(normalizeMcpOAuthScope(['a', ' b ', 'a'])).toBe('a b');
  });

  it('默认不预填、不静默申请 scope', () => {
    expect(parseMcpOAuthScopeList('')).toEqual([]);
    expect(parseMcpOAuthScopeList(undefined)).toEqual([]);
    expect(normalizeMcpOAuthScope('   ')).toBe('');
  });

  it('候选只来自服务端能力与已请求/已授予值，并去重', () => {
    expect(
      buildMcpOAuthScopeCandidates({
        scopesSupported: ['read', 'write', 'read'],
        requestedScope: 'write admin',
        grantedScope: 'read'
      })
    ).toEqual(['read', 'write', 'admin']);
  });

  it('切换候选只改动对应 token', () => {
    expect(toggleMcpOAuthScope('read', 'write')).toBe('read write');
    expect(toggleMcpOAuthScope('read write', 'read')).toBe('write');
    expect(toggleMcpOAuthScope(undefined, 'read')).toBe('read');
  });
});

describe('MCP OAuth 轮询判定', () => {
  it('使用 5s 间隔，最长 5 分钟', () => {
    expect(MCP_OAUTH_POLL_INTERVAL_MS).toBe(5000);
    expect(MCP_OAUTH_POLL_MAX_DURATION_MS).toBe(300_000);
  });

  it('仅可见页面 + 进行中状态轮询', () => {
    expect(
      shouldPollMcpOAuthStatus({ state: 'pending_authorization', documentVisible: true })
    ).toBe(true);
    expect(shouldPollMcpOAuthStatus({ state: 'refreshing', documentVisible: true })).toBe(true);
    expect(shouldPollMcpOAuthStatus({ state: 'refresh_due', documentVisible: true })).toBe(true);
    expect(shouldPollMcpOAuthStatus({ state: 'revoking', documentVisible: true })).toBe(true);
  });

  it('隐藏页面、终态与超时都停止', () => {
    expect(
      shouldPollMcpOAuthStatus({ state: 'pending_authorization', documentVisible: false })
    ).toBe(false);
    for (const state of ['authorized', 'reauth_required', 'config_error', 'headers']) {
      expect(shouldPollMcpOAuthStatus({ state, documentVisible: true })).toBe(false);
    }
    expect(
      shouldPollMcpOAuthStatus({
        state: 'pending_authorization',
        documentVisible: true,
        elapsedMs: MCP_OAUTH_POLL_MAX_DURATION_MS
      })
    ).toBe(false);
  });

  it('进行中状态集合与判定函数一致', () => {
    expect(isMcpOAuthPollingState('refresh_due')).toBe(true);
    expect(isMcpOAuthPollingState('authorized')).toBe(false);
    expect(isMcpOAuthPollingState(null)).toBe(false);
  });
});

describe('MCP OAuth 错误码映射', () => {
  it('从统一 envelope 提取 oauthCode（含 axios response 包装）', () => {
    expect(getMcpOAuthErrorCode({ data: { oauthCode: 'mcp_oauth_conflict' } })).toBe(
      'mcp_oauth_conflict'
    );
    expect(
      getMcpOAuthErrorCode({
        response: { data: { data: { oauthCode: 'mcp_oauth_rate_limited' } } }
      })
    ).toBe('mcp_oauth_rate_limited');
    expect(getMcpOAuthErrorCode(new Error('x'))).toBeUndefined();
  });

  it('已知码返回文案与建议；未知码降级', () => {
    const known = getMcpOAuthErrorCopy('mcp_oauth_reauth_required', t);
    expect(known.message).toBe('需要重新授权');
    expect(known.suggestion).toBe('点击「去授权」重新授权');

    const unknown = getMcpOAuthErrorCopy('mcp_oauth_unknown_code', t);
    expect(unknown.message).toBe('未知错误（mcp_oauth_unknown_code）');

    expect(getMcpOAuthErrorCopy(null, t).message).toBe('发生未知错误');
  });

  it('用户可见错误码覆盖 v2.4 契约且不含已删除的 allowlist 码', () => {
    expect(MCP_OAUTH_USER_FACING_ERROR_CODES).toContain('mcp_oauth_reauth_required');
    expect(MCP_OAUTH_USER_FACING_ERROR_CODES as readonly string[]).not.toContain(
      'mcp_oauth_scope_not_allowed'
    );
    expect(MCP_OAUTH_USER_FACING_ERROR_CODES.length).toBe(46);
  });

  it('8 个状态都有 i18n key，未知状态降级', () => {
    expect(MCP_OAUTH_STATUS_STATES).toHaveLength(8);
    for (const state of MCP_OAUTH_STATUS_STATES) {
      expect(getMcpOAuthStateI18nKey(state)).toBe(`mcpOAuth.state.${state}`);
    }
    expect(getMcpOAuthStateI18nKey('weird')).toBe('mcpOAuth.state.config_error');
  });
});

describe('manual client 表单校验', () => {
  it('clientId 必填', () => {
    expect(validateMcpOAuthManualClient({ clientId: '  ' }).errorKey).toBe(
      'mcpOAuth.manual_client_id_required'
    );
  });

  it('none 认证方式无需 secret', () => {
    const result = validateMcpOAuthManualClient({
      clientId: 'client-1',
      tokenEndpointAuthMethod: 'none'
    });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      clientId: 'client-1',
      tokenEndpointAuthMethod: 'none'
    });
  });

  it('secret 型认证方式必须填写 secret', () => {
    expect(
      validateMcpOAuthManualClient({
        clientId: 'client-1',
        tokenEndpointAuthMethod: 'client_secret_basic'
      }).errorKey
    ).toBe('mcpOAuth.manual_client_secret_required');
  });

  it('认证方式非法', () => {
    expect(
      validateMcpOAuthManualClient({
        clientId: 'client-1',
        clientSecret: 'secret',
        tokenEndpointAuthMethod: 'bad'
      }).errorKey
    ).toBe('mcpOAuth.manual_auth_method_invalid');
  });

  it('manual 表单展示条件', () => {
    expect(shouldShowMcpOAuthManualForm({ clientMode: 'manual' })).toBe(true);
    expect(
      shouldShowMcpOAuthManualForm({ clientMode: 'auto', errorCode: 'mcp_oauth_client_required' })
    ).toBe(true);
    expect(shouldShowMcpOAuthManualForm({ clientMode: 'auto' })).toBe(false);
  });
});

describe('start 请求体与回调参数', () => {
  it('scope 为空时不发送；nodeId 仅在存在时携带', () => {
    expect(
      buildMcpOAuthStartBody({ appId: 'app', clientMode: 'auto', scope: '  ' })
    ).toEqual({ appId: 'app', clientMode: 'auto' });

    expect(
      buildMcpOAuthStartBody({ appId: 'app', nodeId: 'node', clientMode: 'manual', scope: 'a  b a' })
    ).toEqual({ appId: 'app', nodeId: 'node', clientMode: 'manual', scope: 'a b' });
  });

  it('manualClient 仅在提供 clientId 时携带', () => {
    expect(
      buildMcpOAuthStartBody({
        appId: 'app',
        clientMode: 'manual',
        manualClient: { clientId: 'c', clientSecret: 's', tokenEndpointAuthMethod: 'none' }
      }).manualClient
    ).toEqual({ clientId: 'c', clientSecret: 's', tokenEndpointAuthMethod: 'none' });
  });

  it('回调参数解析', () => {
    expect(parseMcpOAuthCallbackQuery({ oauth: 'success' })).toEqual({ kind: 'success' });
    expect(parseMcpOAuthCallbackQuery({ oauth: 'error', code: 'mcp_oauth_access_denied' })).toEqual(
      { kind: 'error', code: 'mcp_oauth_access_denied' }
    );
    expect(parseMcpOAuthCallbackQuery({})).toBeNull();
  });

  it('auto 链路展示顺序固定', () => {
    const steps = getMcpOAuthAutoStepStates({ clientSource: 'dcr' });
    expect(steps.map((item) => item.step)).toEqual(['cimd', 'dcr', 'manual']);
    expect(steps.map((item) => item.state)).toEqual(['skipped', 'done', 'pending']);
  });
});

describe('内联节点隔离与前端硬性检查', () => {
  it('工作流内联 NodeToolSet 不渲染 OAuth 配置', () => {
    const source = readSource('pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeToolSet.tsx');
    expect(source).not.toContain('McpOAuthConfig');
    expect(source).not.toContain('mcpToolsOAuth');
    expect(source).not.toContain('mcpOAuth');
    expect(source).not.toContain('authMode');
    expect(source).toContain('McpToolSetNodeConfigSchema');
  });

  it('独立工具集编辑页渲染 OAuth 配置', () => {
    const editForm = readSource('pageComponents/app/detail/Edit/MCPTools/EditForm.tsx');
    expect(editForm).toContain('McpOAuthConfig');
    expect(editForm).toContain('authMode');
  });

  it('oauth 前端目录不含 allowlist 概念', () => {
    const oauthDir = path.join(srcRoot, 'pageComponents/app/detail/Edit/MCPTools/oauth');
    const source = fs
      .readdirSync(oauthDir)
      .filter((name) => /\.(ts|tsx)$/.test(name))
      .map((name) => fs.readFileSync(path.join(oauthDir, name), 'utf8'))
      .join('\n');
    expect(source).not.toContain('scopeAllowlist');
    expect(source).not.toContain('scope_allowlist');
    expect(source).not.toContain('scope_not_allowed');
  });

  it('去授权前保存、回调后拉取工具并落库', () => {
    const config = readSource('pageComponents/app/detail/Edit/MCPTools/oauth/McpOAuthConfig.tsx');
    expect(config).toContain('onBeforeStart');
    expect(config.indexOf('await onBeforeStart()')).toBeLessThan(
      config.indexOf('await runStart(')
    );

    const page = readSource('pageComponents/app/detail/Edit/MCPTools/index.tsx');
    expect(page).toContain('parseMcpOAuthCallbackQuery');
    expect(page).toContain('await getMCPTools(');
    expect(page).toContain("saveCurrent({ authMode: 'oauth', toolList: tools })");
  });
});
