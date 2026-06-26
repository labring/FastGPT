import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedOptions: undefined as { fetch?: typeof globalThis.fetch } | undefined
}));

vi.mock('@fastgpt/global/sdk/fastgpt-plugin', () => ({
  FastGPTPluginClient: vi.fn().mockImplementation(function FastGPTPluginClient(options) {
    mocks.capturedOptions = options;
    return {};
  })
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    PLUGIN_BASE_URL: 'https://plugin.example.com',
    PLUGIN_TOKEN: 'token'
  }
}));

const { withPluginClientLocale } = await import('@fastgpt/service/thirdProvider/fastgptPlugin');

describe('fastgpt plugin client localized fetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('按当前请求语言把 plugin error reason 写回 message', async () => {
    const rawFetch = mocks.capturedOptions?.fetch;
    if (!rawFetch) {
      throw new Error('Expected plugin client fetch to be configured');
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: 'Debug plugin metadata not found: debug:tmbId:tmb-1',
            reason: {
              en: 'Debug plugin metadata not found: debug:tmbId:tmb-1',
              'zh-CN': '调试插件元数据不存在: debug:tmbId:tmb-1'
            }
          }
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );

    const response = await withPluginClientLocale('zh-CN', () =>
      rawFetch('https://plugin.example.com/api/tool')
    );
    const body = await response.json();

    expect(body.error.message).toBe('调试插件元数据不存在: debug:tmbId:tmb-1');
    expect(body.error.reason).toEqual({
      en: 'Debug plugin metadata not found: debug:tmbId:tmb-1',
      'zh-CN': '调试插件元数据不存在: debug:tmbId:tmb-1'
    });
  });
});
