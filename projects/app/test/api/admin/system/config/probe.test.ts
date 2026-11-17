import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type {
  ProbeConnectionBody,
  ProbeConnectionResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  edition: vi.fn(),
  read: vi.fn(),
  probe: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({ authSystemAdmin: mocks.auth }));
vi.mock(
  '@fastgpt/service/common/system/systemInstanceConfig/controller',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    findOverridesNotAllowedByEdition: mocks.edition,
    getDomainConfig: mocks.read
  })
);
vi.mock('@fastgpt/service/common/system/systemInstanceConfig/probe', () => ({
  probeUrlConnection: mocks.probe
}));

import handler from '@/pages/api/admin/system/config/probe';
import { updateDomainConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';

const call = (body: Partial<ProbeConnectionBody>) =>
  (
    handler as unknown as (
      request: ApiRequestProps<ProbeConnectionBody>
    ) => Promise<ProbeConnectionResponse>
  )({ body } as ApiRequestProps<ProbeConnectionBody>);

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

  it('keeps file service and CDN probes behind administrator authorization without reading credentials', async () => {
    for (const service of ['fileService', 'cdn'] as const) {
      await expect(call({ url: 'https://files.test', service })).resolves.toMatchObject({
        connected: true
      });
      expect(mocks.probe).toHaveBeenLastCalledWith(expect.objectContaining({ service }));
    }
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.edition).not.toHaveBeenCalled();
    mocks.auth.mockRejectedValueOnce(new Error('denied'));
    await expect(call({ url: 'https://files.test', service: 'cdn' })).rejects.toThrow('denied');
    expect(mocks.probe).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['agentSandboxWsProxy', 'wss://proxy.test/base', 'wsUrl'],
    ['agentSandboxPreviewProxy', 'https://preview.test/base', 'previewUrl']
  ] as const)(
    'authorizes %s without reading or accepting proxy secrets',
    async (service, url, key) => {
      const controller = await vi.importActual<
        typeof import('@fastgpt/service/common/system/systemInstanceConfig/controller')
      >('@fastgpt/service/common/system/systemInstanceConfig/controller');
      mocks.edition.mockImplementation((args) =>
        controller.findOverridesNotAllowedByEdition({ ...args, edition: 'community' })
      );
      await expect(call({ service, url })).resolves.toMatchObject({ connected: true });
      expect(mocks.edition).toHaveBeenCalledWith({
        domain: 'subservice',
        submittedOverrides: { agentSandbox: { proxy: { [key]: url } } }
      });
      expect(mocks.read).not.toHaveBeenCalled();
      for (const overrides of [
        { token: 'secret' },
        { useStoredToken: true },
        { url: `${url}?token=secret` },
        { url: `${url}#fragment` },
        { url: url.replace('://', '://user:secret@') },
        { url: service === 'agentSandboxWsProxy' ? 'https://proxy.test' : 'wss://proxy.test' }
      ]) {
        await expect(call({ service, url, ...overrides })).rejects.toThrow();
      }
      expect(mocks.probe).toHaveBeenCalledTimes(1);
      mocks.edition.mockReturnValueOnce([`agentSandbox.proxy.${key}`]);
      await expect(call({ service, url })).rejects.toMatchObject({ statusCode: 403 });
      mocks.auth.mockRejectedValueOnce(new Error('denied'));
      await expect(call({ service, url })).rejects.toThrow('denied');
      expect(mocks.probe).toHaveBeenCalledTimes(1);
    }
  );

  it('exposes only a fixed, uncached file-route health marker', async () => {
    const { default: health } = await import('@/pages/api/system/file/health');
    const setHeader = vi.fn();
    await expect((health as any)({}, { setHeader })).resolves.toEqual({
      service: 'fastgpt-file-service'
    });
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('reads and decrypts the stored credential only after administrator and edition authorization', async () => {
    await updateDomainConfig({
      domain: 'subservice',
      expectedRevision: 0,
      submittedOverrides: { codeSandbox: { token: 'persisted-secret' } },
      actor: { actor: 'admin' }
    });
    const stored = await MongoSystemInstanceConfig.findOne({ domain: 'subservice' }).lean();
    const storedOverrides = stored?.overrides as
      | { codeSandbox?: { token?: { secret: string } } }
      | undefined;
    const storedToken = storedOverrides?.codeSandbox?.token;
    expect(storedToken).toEqual({ secret: expect.any(String) });
    expect(JSON.stringify(stored?.overrides)).not.toContain('persisted-secret');
    const controller = await vi.importActual<
      typeof import('@fastgpt/service/common/system/systemInstanceConfig/controller')
    >('@fastgpt/service/common/system/systemInstanceConfig/controller');
    mocks.read.mockImplementation(controller.getDomainConfig);

    const result = await call({
      service: 'codeSandbox',
      url: 'http://sandbox:3002',
      useStoredToken: true
    });
    expect(result).toMatchObject({ connected: true });
    expect(JSON.stringify(result)).not.toContain('persisted-secret');
    expect(JSON.stringify(result)).not.toContain(storedToken?.secret ?? '');
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

  it('does not read stored credentials for empty or draft tokens and retains generic compatibility', async () => {
    await call({ service: 'codeSandbox', url: 'http://sandbox:3002', token: '' });
    await call({ service: 'codeSandbox', url: 'http://sandbox:3002', token: 'draft-secret' });
    await call({ service: 'codeSandbox', url: 'http://sandbox:3002', token: '******' });
    await call({ url: 'http://sandbox:3002' });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.probe.mock.calls.map(([body]) => body.token)).toEqual([
      '',
      'draft-secret',
      '******',
      undefined
    ]);
  });

  it('denies unauthorized requests and edition violations before reading or probing', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('unauthorized'));
    await expect(
      call({ service: 'codeSandbox', url: 'http://sandbox:3002', useStoredToken: true })
    ).rejects.toThrow('unauthorized');
    mocks.edition.mockReturnValueOnce(['codeSandbox.token']);
    await expect(
      call({ service: 'codeSandbox', url: 'http://sandbox:3002', useStoredToken: true })
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

  it('rejects stored-token requests combined with a draft or an unsupported service', async () => {
    for (const body of [
      { service: 'codeSandbox' as const, token: '', useStoredToken: true },
      { service: 'codeSandbox' as const, token: 'draft', useStoredToken: true },
      { service: 'mcpSse' as const, useStoredToken: true },
      { useStoredToken: true }
    ]) {
      await expect(call({ url: 'http://sandbox:3002', ...body })).rejects.toThrow();
    }
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it('does not probe when a stored credential cannot be decrypted', async () => {
    await MongoSystemInstanceConfig.collection.insertOne({
      domain: 'subservice',
      revision: 1,
      schemaVersion: 1,
      overrides: {
        codeSandbox: { token: { secret: `${'0'.repeat(32)}:00:${'0'.repeat(32)}` } }
      },
      updatedBy: { actor: 'system' }
    });
    const controller = await vi.importActual<
      typeof import('@fastgpt/service/common/system/systemInstanceConfig/controller')
    >('@fastgpt/service/common/system/systemInstanceConfig/controller');
    mocks.read.mockImplementation(controller.getDomainConfig);
    await expect(
      call({ service: 'codeSandbox', url: 'http://sandbox:3002', useStoredToken: true })
    ).rejects.toThrow('Unable to decrypt configuration secret');
    expect(mocks.probe).not.toHaveBeenCalled();
  });
});
