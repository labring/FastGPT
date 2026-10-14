import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/common/system/getInitData';
import { Call } from '@test/utils/request';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import * as providerMetadata from '@fastgpt/service/core/ai/model/provider/controller';
import {
  FastGPTFeConfigsSchema,
  type FastGPTFeConfigsType
} from '@fastgpt/global/common/system/types';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { ZodError } from 'zod';

// 公开字段和值只维护一份；精确响应断言同时验证保留值和顶层、嵌套字段过滤。
const publicConfig = {
  systemTitle: 'Custom FastGPT',
  favicon: '/custom.ico',
  scripts: [{ src: 'https://analytics.example.com/script.js' }],
  isPlus: true,
  login_method: ['email', 'phone'],
  register_method: ['email', 'phone', 'sync'],
  find_password_method: ['email'],
  loginGuideDocUrl: 'https://docs.example.com/login',
  docUrl: 'https://docs.example.com/',
  chineseRedirectUrl: 'https://cn.example.com',
  wecomLoginAutoRedirect: false,
  sso: {
    icon: '/sso.svg',
    title: 'Company SSO',
    url: 'https://sso.example.com',
    autoLogin: true,
    disablePasswordForSsoUsers: true
  },
  oauth: {
    github: 'github-client',
    google: 'google-client',
    wechat: 'wechat-app',
    wecom: true,
    microsoft: {
      clientId: 'microsoft-client',
      tenantId: 'company-tenant',
      customButton: 'Company Microsoft'
    }
  },
  uploadFileMaxAmount: 7,
  uploadFileMaxSize: 32,
  show_compliance_copywriting: true,
  enable_team_model: true,
  agentSandboxProxyUrl: 'https://sandbox.example.com',
  limit: { agentSandboxMaxFileBytes: 2 * 1024 ** 2 }
} satisfies FastGPTFeConfigsType;

const auth = {
  userId: 'user-1',
  teamId: 'team-1',
  tmbId: 'member-1',
  appId: '',
  authType: AuthUserTypeEnum.token,
  sourceName: undefined,
  apikey: '',
  isRoot: false,
  sessionId: 'session-1'
};

const channel = {
  channelId: 1,
  name: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
  avatar: 'model/openai',
  website: 'https://openai.example.com'
};

describe('getInitData anonymous configuration filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInitBufferId = 'config-1';
    global.systemVersion = '4.17.3';
    global.aiproxyChannelsCache = [channel];
    global.subPlans = { extraDatasetSize: { price: 4 } };
    global.feConfigs = {
      ...structuredClone(publicConfig),
      sso: {
        ...publicConfig.sso,
        clientSecret: 'private-sso-secret'
      },
      oauth: {
        ...publicConfig.oauth,
        clientSecret: 'private-oauth-secret',
        microsoft: {
          ...publicConfig.oauth.microsoft,
          clientSecret: 'private-microsoft-secret'
        }
      },
      limit: {
        ...publicConfig.limit,
        workflowParallelRunMaxConcurrency: 20,
        maxFolderDepth: 4,
        privateLimit: 'private-limit'
      },
      show_pay: true,
      payConfig: { wx: true, alipay: true },
      payFormUrl: 'https://pay.example.com',
      teamMode: 'sync',
      futurePrivateField: 'private-future-config'
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('projects public fields without leaking private or unknown nested fields', async () => {
    const privateFields = Object.keys(FastGPTFeConfigsSchema.shape).filter(
      (key) => !Object.keys(publicConfig).includes(key)
    );
    global.feConfigs = {
      ...global.feConfigs,
      ...Object.fromEntries(privateFields.map((key) => [key, `private-${key}`]))
    };
    const originalConfig = structuredClone(global.feConfigs);
    const { code, data } = await Call(handler, { headers: {} });

    expect(code).toBe(200);
    expect(data).toEqual({
      isAuthenticated: false,
      bufferId: 'unAuth_v6_config-1',
      feConfigs: publicConfig
    });
    expect(global.feConfigs).toEqual(originalConfig);
  });

  it('returns complete configuration when an authenticated member has an anonymous cache', async () => {
    const { code, data } = await Call(handler, {
      auth,
      headers: {},
      query: { bufferId: 'unAuth_v6_config-1' }
    });

    expect(code).toBe(200);
    expect(data).toEqual({
      isAuthenticated: true,
      bufferId: 'config-1',
      feConfigs: global.feConfigs,
      subPlans: global.subPlans,
      systemVersion: '4.17.3'
    });
  });

  it('preserves the authenticated cache-hit response', async () => {
    const { data } = await Call(handler, { auth, headers: {}, query: { bufferId: 'config-1' } });

    expect(data).toEqual({
      isAuthenticated: true,
      bufferId: 'config-1',
      feConfigs: global.feConfigs,
      systemVersion: '4.17.3'
    });
  });

  it.each([
    'unAuth_config-1',
    'unAuth_v2_config-1',
    'unAuth_v3_chat_config-1',
    'config-1',
    'unAuth_v4_chat_config-1',
    'unAuth_v5_config-1',
    'unAuth_v6_config-old',
    'unAuth_v4_share_config-1'
  ])('refreshes stale or authenticated cache %s with filtered data', async (bufferId) => {
    const { data } = await Call(handler, { headers: {}, query: { bufferId } });

    expect(data.bufferId).toBe('unAuth_v6_config-1');
    expect(data.feConfigs).toEqual(publicConfig);
  });

  it('retains the anonymous cache-hit response only for the current policy version', async () => {
    const { data } = await Call(handler, {
      headers: {},
      query: { bufferId: 'unAuth_v6_config-1' }
    });

    expect(data).toEqual({ isAuthenticated: false, bufferId: 'unAuth_v6_config-1' });
  });

  it.each([
    {
      headers: { referer: 'https://app.example.com/price?resumePurchase=1#standard' },
      query: { bufferId: 'unAuth_v6_config-1' }
    },
    {
      headers: { referer: 'https://app.example.com/login' },
      query: { bufferId: 'unAuth_v6_config-1', includeSubPlans: 'true' }
    }
  ])(
    'returns filtered configs and public plans despite a matching anonymous buffer: %s',
    async ({ headers, query }) => {
      const { data } = await Call(handler, {
        headers,
        query
      });
      expect(data).toEqual({
        isAuthenticated: false,
        feConfigs: publicConfig,
        subPlans: global.subPlans
      });
    }
  );

  it.each([undefined, ''])(
    'returns filtered data without treating an absent system version %s as a cache hit',
    async (systemBufferId) => {
      global.systemInitBufferId = systemBufferId;
      const { data } = await Call(handler, { headers: {}, query: { bufferId: '' } });

      expect(data.bufferId).toBe('');
      expect(data.feConfigs).toEqual(publicConfig);
    }
  );

  it.each([
    {
      name: 'missing optional login and sandbox settings',
      config: { uploadFileMaxAmount: 3, uploadFileMaxSize: 16 }
    },
    {
      name: 'false, zero and empty nested settings without Microsoft',
      config: {
        uploadFileMaxAmount: 0,
        uploadFileMaxSize: 0,
        isPlus: false,
        wecomLoginAutoRedirect: false,
        show_compliance_copywriting: false,
        oauth: { wecom: false },
        sso: {},
        limit: { agentSandboxMaxFileBytes: 0 }
      }
    }
  ])('preserves $name', async ({ config }) => {
    global.feConfigs = config;
    const { code, data } = await Call(handler, { headers: {} });
    expect(code).toBe(200);
    expect(data.feConfigs).toEqual(config);
  });

  it('treats an expired session as anonymous without exposing complete configuration', async () => {
    vi.mocked(authCert).mockRejectedValueOnce(new Error('Session expired'));
    const { data } = await Call(handler, {
      auth,
      headers: { referer: 'https://app.example.com/login' }
    });

    expect(data.bufferId).toBe('unAuth_v6_config-1');
    expect(data.feConfigs).not.toHaveProperty('payConfig');
  });

  it('does not depend on channel metadata even when the provider cache is unavailable', async () => {
    const readMetadata = vi
      .spyOn(providerMetadata, 'getModelProviderMetadata')
      .mockImplementation(() => {
        throw new Error('Provider metadata unavailable');
      });
    const response = await Call(handler, { auth, headers: {} });

    expect(response.code).toBe(200);
    expect(response.data).not.toHaveProperty('aiproxyChannels');
    expect(readMetadata).not.toHaveBeenCalled();
  });

  it('rejects malformed query input before authentication', async () => {
    const invalidQuery = await Call(handler, { headers: {}, query: { bufferId: ['config-1'] } });

    expect(invalidQuery.error).toBeInstanceOf(ApiRequestInputParseError);
    expect(authCert).not.toHaveBeenCalled();
  });

  it.each([
    'https://app.example.com/login?next=/price',
    'https://app.example.com/price-extra',
    'invalid referer'
  ])('does not return plans for an incidental or malformed Referer: %s', async (referer) => {
    const { data } = await Call(handler, { headers: { referer } });
    expect(data.feConfigs).toEqual(publicConfig);
    expect(data).not.toHaveProperty('subPlans');
  });
  it('includes requested plans for an authenticated cache hit', async () => {
    const { data } = await Call(handler, {
      auth,
      headers: {},
      query: { bufferId: 'config-1', includeSubPlans: true }
    });
    expect(data.subPlans).toEqual(global.subPlans);
  });

  it('reports invalid response data as an internal schema error', async () => {
    global.feConfigs.uploadFileMaxSize = Number.NaN;
    const invalidResponse = await Call(handler, { auth, headers: {} });

    expect(invalidResponse.code).toBe(500);
    expect(invalidResponse.error).toBeInstanceOf(ZodError);
  });
});
