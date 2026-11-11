import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { ProbeConnectionBody } from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  edition: vi.fn(),
  read: vi.fn(),
  probe: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({ authSystemAdmin: mocks.auth }));
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/controller', () => ({
  findOverridesNotAllowedByEdition: mocks.edition,
  getDomainConfig: mocks.read
}));
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/probe', () => ({
  probeUrlConnection: mocks.probe
}));

import handler from '@/pages/api/admin/system/config/probe';

const call = (body: Partial<ProbeConnectionBody>) =>
  handler({ body } as ApiRequestProps<ProbeConnectionBody>);

describe('admin subservice probe', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({});
    mocks.edition.mockReturnValue([]);
    mocks.read.mockResolvedValue({
      effectiveConfig: { codeSandbox: { token: 'persisted-secret' } }
    });
    mocks.probe.mockResolvedValue({ connected: true, status: 200, responseTimeMs: 1 });
  });

  it('restores masked credentials only after administrator and edition authorization', async () => {
    await expect(
      call({ service: 'codeSandbox', url: 'http://sandbox:3002', token: '******' })
    ).resolves.toMatchObject({ connected: true });
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.edition.mock.invocationCallOrder[0]
    );
    expect(mocks.edition.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.read.mock.invocationCallOrder[0]
    );
    expect(mocks.probe).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'persisted-secret' })
    );
  });

  it('does not restore empty or draft credentials and retains generic compatibility', async () => {
    await call({ service: 'codeSandbox', url: 'http://sandbox:3002', token: '' });
    await call({ service: 'codeSandbox', url: 'http://sandbox:3002', token: 'draft-secret' });
    await call({ url: 'http://sandbox:3002' });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.probe.mock.calls.map(([body]) => body.token)).toEqual([
      '',
      'draft-secret',
      undefined
    ]);
  });

  it('denies unauthorized requests and edition violations before reading or probing', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('unauthorized'));
    await expect(
      call({ service: 'codeSandbox', url: 'http://sandbox:3002', token: '******' })
    ).rejects.toThrow('unauthorized');
    mocks.edition.mockReturnValueOnce(['codeSandbox.token']);
    await expect(
      call({ service: 'codeSandbox', url: 'http://sandbox:3002', token: '******' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it('rejects tokens for generic or MCP probes', async () => {
    await expect(call({ url: 'http://sandbox:3002', token: 'secret' })).rejects.toThrow();
    await expect(
      call({ service: 'mcpSse', url: 'http://sandbox:3002', token: 'secret' })
    ).rejects.toThrow();
    expect(mocks.probe).not.toHaveBeenCalled();
  });
});
