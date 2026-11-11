import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ proUrl: 'http://pro.invalid/api', get: vi.fn() }));

vi.mock('@fastgpt/service/common/system/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/constants')>()),
  get FastGPTProUrl() {
    return mocks.proUrl;
  }
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPro/plusRequest', () => ({ GET: mocks.get }));

import { getSsoConfigured } from '@fastgpt/service/common/system/sso';

describe('getSsoConfigured', () => {
  let originalHandler: typeof global.getSsoConfiguredHandler;

  beforeEach(() => {
    originalHandler = global.getSsoConfiguredHandler;
    global.getSsoConfiguredHandler = undefined;
    mocks.proUrl = 'http://pro.invalid/api';
    mocks.get.mockReset();
  });

  afterEach(() => {
    global.getSsoConfiguredHandler = originalHandler;
  });

  it('uses the Pro process resolver without a self request', async () => {
    global.getSsoConfiguredHandler = () => true;
    await expect(getSsoConfigured()).resolves.toBe(true);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('returns false in community deployments without a Pro request', async () => {
    mocks.proUrl = '';
    await expect(getSsoConfigured()).resolves.toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each([false, true])('validates the authenticated Pro response enabled=%s', async (enabled) => {
    mocks.get.mockResolvedValue({ enabled });
    await expect(getSsoConfigured()).resolves.toBe(enabled);
    expect(mocks.get).toHaveBeenCalledWith('/common/system/sso/config', {}, { timeout: 1500 });
  });

  it('hides request details and rejects unreachable, malformed, or invalid local responses', async () => {
    mocks.get.mockRejectedValueOnce(new Error('synthetic-private-pro-token'));
    const error = await getSsoConfigured().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty('message', 'SSO configuration is unavailable');
    expect(JSON.stringify(error)).not.toContain('synthetic-private-pro-token');

    mocks.get.mockResolvedValueOnce({ enabled: 'true' });
    await expect(getSsoConfigured()).rejects.toThrow('SSO configuration is unavailable');
    global.getSsoConfiguredHandler = () => 'true' as unknown as boolean;
    await expect(getSsoConfigured()).rejects.toThrow('SSO configuration is unavailable');
  });
});
