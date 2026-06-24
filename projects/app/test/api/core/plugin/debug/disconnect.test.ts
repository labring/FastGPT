import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  pluginClient: {
    revokeDebugSession: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: mocks.pluginClient
}));

import handler from '@/pages/api/plugin/debug-channel/revoke';

describe('plugin debug channel revoke handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCert.mockResolvedValue({
      tmbId: 'tmb_test'
    });
    mocks.pluginClient.revokeDebugSession.mockResolvedValue({
      revoked: true
    });
  });

  it('uses current tmbId to revoke debug channel', async () => {
    const res = await Call(handler, {
      body: {},
      auth: {
        tmbId: 'tmb_test'
      } as any
    });

    expect(res.code).toBe(200);
    expect(mocks.authCert).toHaveBeenCalledWith({
      req: expect.objectContaining({
        body: {}
      }),
      authToken: true
    });
    expect(mocks.pluginClient.revokeDebugSession).toHaveBeenCalledWith({
      tmbId: 'tmb_test',
      reason: 'user-revoke'
    });
    expect(res.data).toEqual({
      revoked: true
    });
  });

  it('treats missing debug channel as already revoked', async () => {
    mocks.pluginClient.revokeDebugSession.mockRejectedValueOnce(
      new Error('Debug session not found')
    );

    const res = await Call(handler, {
      body: {},
      auth: {
        tmbId: 'tmb_test'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      revoked: false
    });
  });
});
