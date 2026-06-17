import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    PLUGIN_BASE_URL: 'https://plugin.example.com/',
    PLUGIN_TOKEN: 'plugin-token'
  }
}));

const { createPluginDebugSession } =
  await import('@fastgpt/service/thirdProvider/fastgptPlugin/debugSession');

describe('fastgpt plugin debug session client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          debugSessionId: 'dbg_test',
          tmbId: 'tmb_test',
          source: 'debug:tmbId:tmb_test:session:dbg_test',
          ticket: 'ticket_test',
          ticketExpiresAt: 1781500000000,
          expiresAt: 1781514400000
        }
      })
    });
  });

  it('默认创建 4 小时调试会话', async () => {
    await createPluginDebugSession({
      tmbId: 'tmb_test',
      fastgptBaseUrl: 'https://fastgpt.example.com'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://plugin.example.com/api/plugin/debug-sessions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer plugin-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tmbId: 'tmb_test',
          ttlMs: 4 * 60 * 60 * 1000
        })
      })
    );
  });
});
