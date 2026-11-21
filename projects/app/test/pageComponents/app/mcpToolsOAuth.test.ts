import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_OAUTH_USER_FACING_ERROR_CODES } from '@/pageComponents/app/detail/Edit/MCPTools/oauth/errorCodes';
import {
  MCP_OAUTH_CALLBACK_QUERY_KEYS,
  MCP_OAUTH_POLL_INTERVAL_MS,
  MCP_OAUTH_POLL_MAX_DURATION_MS,
  MCP_OAUTH_POLLING_STATES,
  MCP_OAUTH_STATE_PRESENTATION,
  MCP_OAUTH_STATUS_STATES,
  buildMcpOAuthScopeCandidates,
  buildMcpOAuthStartBody,
  getMcpOAuthAutoStepStates,
  getMcpOAuthErrorCode,
  getMcpOAuthErrorCopy,
  getMcpOAuthStateI18nKey,
  getMcpOAuthStatePresentation,
  isMcpOAuthPollingState,
  normalizeMcpOAuthScope,
  parseMcpOAuthCallbackQuery,
  parseMcpOAuthScopeList,
  shouldPollMcpOAuthStatus,
  shouldShowMcpOAuthManualForm,
  stripMcpOAuthCallbackQuery,
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

describe('MCP OAuth 轮询判定（handoff §9.3）', () => {
  it('使用 2s 间隔，最长 5 分钟', () => {
    expect(MCP_OAUTH_POLL_INTERVAL_MS).toBe(2000);
    expect(MCP_OAUTH_POLL_MAX_DURATION_MS).toBe(300_000);
  });

  it('仅 pending_authorization / refreshing 两个服务端状态轮询', () => {
    expect(MCP_OAUTH_POLLING_STATES).toEqual(['pending_authorization', 'refreshing']);
    expect(shouldPollMcpOAuthStatus({ state: 'pending_authorization' })).toBe(true);
    expect(shouldPollMcpOAuthStatus({ state: 'refreshing' })).toBe(true);
    // refresh_due 是可用态，不是进行中态；revoking 不是 v2.4 服务端状态。
    expect(shouldPollMcpOAuthStatus({ state: 'refresh_due' })).toBe(false);
    expect(shouldPollMcpOAuthStatus({ state: 'revoking' })).toBe(false);
  });

  it('终态与超时都停止', () => {
    for (const state of [
      'headers',
      'config_error',
      'client_missing',
      'authorized',
      'refresh_due',
      'reauth_required'
    ]) {
      expect(shouldPollMcpOAuthStatus({ state })).toBe(false);
    }
    expect(
      shouldPollMcpOAuthStatus({
        state: 'pending_authorization',
        elapsedMs: MCP_OAUTH_POLL_MAX_DURATION_MS
      })
    ).toBe(false);
  });

  it('进行中状态集合与判定函数一致', () => {
    expect(isMcpOAuthPollingState('pending_authorization')).toBe(true);
    expect(isMcpOAuthPollingState('refreshing')).toBe(true);
    expect(isMcpOAuthPollingState('authorized')).toBe(false);
    expect(isMcpOAuthPollingState(null)).toBe(false);
  });
});

describe('MCP OAuth 8 态渲染映射', () => {
  it('8 个服务端状态都有独立展示配置与 hint key', () => {
    expect(Object.keys(MCP_OAUTH_STATE_PRESENTATION).sort()).toEqual(
      [...MCP_OAUTH_STATUS_STATES].sort()
    );
    const hints = new Set<string>();
    for (const state of MCP_OAUTH_STATUS_STATES) {
      const presentation = getMcpOAuthStatePresentation(state);
      expect(presentation.hintKey).toBe(`mcpOAuth.state_hint.${state}`);
      hints.add(presentation.hintKey);
    }
    expect(hints.size).toBe(8);
  });

  it('每态的动作显隐符合 handoff 状态机', () => {
    expect(getMcpOAuthStatePresentation('headers').showStart).toBe(false);
    expect(getMcpOAuthStatePresentation('config_error').showStart).toBe(false);
    expect(getMcpOAuthStatePresentation('client_missing')).toMatchObject({
      showStart: true,
      manualForm: true,
      parseEnabled: false
    });
    expect(getMcpOAuthStatePresentation('pending_authorization')).toMatchObject({
      showStart: true,
      parseEnabled: false
    });
    expect(getMcpOAuthStatePresentation('authorized')).toMatchObject({
      showStart: false,
      showDisconnect: true,
      showReset: true,
      parseEnabled: true
    });
    expect(getMcpOAuthStatePresentation('refresh_due')).toMatchObject({
      showDisconnect: true,
      parseEnabled: true
    });
    expect(getMcpOAuthStatePresentation('refreshing').showStart).toBe(false);
    expect(getMcpOAuthStatePresentation('reauth_required')).toMatchObject({
      showStart: true,
      startActionKey: 'mcpOAuth.action_reauth'
    });
    expect(getMcpOAuthStatePresentation('weird').hintKey).toBe('mcpOAuth.state_hint.config_error');
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
    expect(buildMcpOAuthStartBody({ appId: 'app', clientMode: 'auto', scope: '  ' })).toEqual({
      appId: 'app',
      clientMode: 'auto'
    });

    expect(
      buildMcpOAuthStartBody({
        appId: 'app',
        nodeId: 'node',
        clientMode: 'manual',
        scope: 'a  b a'
      })
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

  it('立即清理 oauth/code query，保留其它参数', () => {
    expect(MCP_OAUTH_CALLBACK_QUERY_KEYS).toEqual(['oauth', 'code']);
    const query = { appId: 'app-1', oauth: 'error', code: 'mcp_oauth_access_denied' };
    expect(stripMcpOAuthCallbackQuery(query)).toEqual({ appId: 'app-1' });
    // 不修改入参（避免 router.query 被就地改写）。
    expect(query.oauth).toBe('error');
    expect(stripMcpOAuthCallbackQuery({ oauth: 'success' })).toEqual({});
  });

  it('auto 链路展示顺序固定', () => {
    const steps = getMcpOAuthAutoStepStates({ clientSource: 'dcr' });
    expect(steps.map((item) => item.step)).toEqual(['cimd', 'dcr', 'manual']);
    expect(steps.map((item) => item.state)).toEqual(['skipped', 'done', 'pending']);
  });
});

describe('内联节点隔离与前端硬性检查', () => {
  it('工作流内联 NodeToolSet 不渲染 OAuth 配置', () => {
    const source = readSource(
      'pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeToolSet.tsx'
    );
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
    expect(config.indexOf('await onBeforeStart()')).toBeLessThan(config.indexOf('await runStart('));

    const page = readSource('pageComponents/app/detail/Edit/MCPTools/index.tsx');
    expect(page).toContain('parseMcpOAuthCallbackQuery');
    expect(page).toContain('stripMcpOAuthCallbackQuery');
    // 成功回调顺序：拉取工具 → 保存 toolList → 刷新 status。
    const fetchIdx = page.indexOf('await getMCPTools(');
    const saveIdx = page.indexOf("saveCurrent({ authMode: 'oauth', toolList: tools })");
    const refreshIdx = page.indexOf('await refreshStatus()');
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(fetchIdx);
    expect(refreshIdx).toBeGreaterThan(saveIdx);
  });

  it('8 态状态徽标由 presentation 驱动，不再硬编码按钮显隐', () => {
    const config = readSource('pageComponents/app/detail/Edit/MCPTools/oauth/McpOAuthConfig.tsx');
    expect(config).toContain('getMcpOAuthStatePresentation');
    expect(config).toContain('presentation.hintKey');
    expect(config).toContain('presentation.showStart');
    expect(config).toContain('presentation.showDisconnect');
  });
});

describe('MCP OAuth i18n 四语言完整性', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
  const locales = ['en', 'zh-CN', 'zh-Hant', 'ko-KR'] as const;
  const readLocale = (lang: string) =>
    JSON.parse(
      fs.readFileSync(path.resolve(repoRoot, 'packages/web/i18n', lang, 'common.json'), 'utf8')
    ) as Record<string, string>;

  it('8 个状态与状态 hint 在四语言中都存在且非空', () => {
    for (const lang of locales) {
      const dict = readLocale(lang);
      for (const state of MCP_OAUTH_STATUS_STATES) {
        expect(dict[`mcpOAuth.state.${state}`], `${lang} state.${state}`).toBeTruthy();
        expect(dict[`mcpOAuth.state_hint.${state}`], `${lang} state_hint.${state}`).toBeTruthy();
      }
    }
  });

  it('所有用户可见错误码在四语言都有固定文案', () => {
    for (const lang of locales) {
      const dict = readLocale(lang);
      for (const code of MCP_OAUTH_USER_FACING_ERROR_CODES) {
        expect(dict[`mcpOAuth.error.${code}`], `${lang} error.${code}`).toBeTruthy();
      }
      expect(dict['mcpOAuth.errorSuggestion.unknown']).toBeTruthy();
    }
  });

  it('四语言 mcpOAuth.* key 集合完全一致', () => {
    const keySets = locales.map(
      (lang) => new Set(Object.keys(readLocale(lang)).filter((key) => key.startsWith('mcpOAuth.')))
    );
    const reference = [...keySets[0]].sort();
    for (let i = 1; i < keySets.length; i++) {
      expect([...keySets[i]].sort()).toEqual(reference);
    }
  });
});
