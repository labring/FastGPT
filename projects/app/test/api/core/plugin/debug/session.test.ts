import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  createPluginDebugSession: vi.fn(),
  feDomain: undefined as string | undefined
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin/debugSession', () => ({
  createPluginDebugSession: mocks.createPluginDebugSession
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    get FE_DOMAIN() {
      return mocks.feDomain;
    }
  }
}));

import handler from '@/pages/api/core/plugin/debug/session';

describe('plugin debug session create handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feDomain = undefined;
    mocks.authCert.mockResolvedValue({
      tmbId: 'tmb_test'
    });
    mocks.createPluginDebugSession.mockResolvedValue({
      debugSessionId: 'dbg_test',
      tmbId: 'tmb_test',
      source: 'debug:tmbId:tmb_test:session:dbg_test',
      ticket: 'ticket_test',
      ticketExpiresAt: 1781500000000,
      expiresAt: 1781500000000,
      connectUrl: 'https://fastgpt.example.com/api/plugin/debug/connect?ticket=ticket_test',
      cliCommand:
        'fastgpt-plugin debug ./plugin-a --connect "https://fastgpt.example.com/api/plugin/debug/connect?ticket=ticket_test"'
    });
  });

  it('uses current tmbId to create debug session and returns cli connect info', async () => {
    const res = await Call(handler, {
      body: {
        ttlMs: 60000
      },
      headers: {
        host: 'fastgpt.example.com',
        'x-forwarded-proto': 'https'
      },
      auth: {
        tmbId: 'tmb_test'
      } as any
    });

    expect(res.code).toBe(200);
    expect(mocks.authCert).toHaveBeenCalledWith({
      req: expect.objectContaining({
        body: {
          ttlMs: 60000
        }
      }),
      authToken: true
    });
    expect(mocks.createPluginDebugSession).toHaveBeenCalledWith({
      tmbId: 'tmb_test',
      ttlMs: 60000,
      fastgptBaseUrl: 'https://fastgpt.example.com'
    });
    expect(res.data).toEqual({
      debugSessionId: 'dbg_test',
      tmbId: 'tmb_test',
      source: 'debug:tmbId:tmb_test:session:dbg_test',
      ticket: 'ticket_test',
      ticketExpiresAt: 1781500000000,
      expiresAt: 1781500000000,
      connectUrl: 'https://fastgpt.example.com/api/plugin/debug/connect?ticket=ticket_test',
      cliCommand:
        'fastgpt-plugin debug ./plugin-a --connect "https://fastgpt.example.com/api/plugin/debug/connect?ticket=ticket_test"'
    });
  });

  it('prefers configured FE_DOMAIN when building connect url base', async () => {
    mocks.feDomain = 'https://public.fastgpt.example.com';

    const res = await Call(handler, {
      body: {},
      headers: {
        host: 'internal.local'
      },
      auth: {
        tmbId: 'tmb_test'
      } as any
    });

    expect(res.code).toBe(200);
    expect(mocks.createPluginDebugSession).toHaveBeenCalledWith({
      tmbId: 'tmb_test',
      ttlMs: undefined,
      fastgptBaseUrl: 'https://public.fastgpt.example.com'
    });
  });
});
