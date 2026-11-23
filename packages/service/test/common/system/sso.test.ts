import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ proUrl: 'http://pro.invalid/api', get: vi.fn() }));

vi.mock('@fastgpt/service/common/system/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/constants')>()),
  get FastGPTProUrl() {
    return mocks.proUrl;
  }
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPro/plusRequest', () => ({ GET: mocks.get }));

import { getSsoConfig, getSsoConfigured } from '@fastgpt/service/common/system/sso';

describe('getSsoConfig & getSsoConfigured', () => {
  let originalConfiguredHandler: typeof global.getSsoConfiguredHandler;
  let originalConfigHandler: typeof global.getSsoConfigHandler;

  beforeEach(() => {
    originalConfiguredHandler = global.getSsoConfiguredHandler;
    originalConfigHandler = global.getSsoConfigHandler;
    global.getSsoConfiguredHandler = undefined;
    global.getSsoConfigHandler = undefined;
    mocks.proUrl = 'http://pro.invalid/api';
    mocks.get.mockReset();
  });

  afterEach(() => {
    global.getSsoConfiguredHandler = originalConfiguredHandler;
    global.getSsoConfigHandler = originalConfigHandler;
  });

  it('uses the Pro process resolver without a self request', async () => {
    global.getSsoConfiguredHandler = () => true;
    await expect(getSsoConfigured()).resolves.toBe(true);
    await expect(getSsoConfig()).resolves.toEqual({ enabled: true, isWecom: false });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('prefers getSsoConfigHandler in getSsoConfig while keeping getSsoConfigured on the fast boolean resolver', async () => {
    global.getSsoConfiguredHandler = () => true;
    global.getSsoConfigHandler = () => ({ enabled: true, isWecom: true });

    await expect(getSsoConfig()).resolves.toEqual({ enabled: true, isWecom: true });
    await expect(getSsoConfigured()).resolves.toBe(true);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('returns disabled config in community deployments without a Pro request', async () => {
    mocks.proUrl = '';
    await expect(getSsoConfigured()).resolves.toBe(false);
    await expect(getSsoConfig()).resolves.toEqual({ enabled: false, isWecom: false });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each([false, true])('validates the authenticated Pro response enabled=%s', async (enabled) => {
    mocks.get.mockResolvedValue({ enabled });
    await expect(getSsoConfigured()).resolves.toBe(enabled);
    expect(mocks.get).toHaveBeenCalledWith('/common/system/sso/config', {}, { timeout: 1500 });
  });

  it.each([
    { response: { enabled: true, isWecom: true }, expected: { enabled: true, isWecom: true } },
    { response: { enabled: true, isWecom: false }, expected: { enabled: true, isWecom: false } },
    { response: { enabled: true }, expected: { enabled: true, isWecom: false } },
    { response: { enabled: false, isWecom: true }, expected: { enabled: false, isWecom: false } }
  ])('normalizes Pro response $response to $expected', async ({ response, expected }) => {
    mocks.get.mockResolvedValueOnce(response);
    await expect(getSsoConfig()).resolves.toEqual(expected);
  });

  it('hides request details and rejects unreachable, malformed, or invalid local responses', async () => {
    mocks.get.mockRejectedValueOnce(new Error('synthetic-private-pro-token'));
    const error = await getSsoConfigured().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty('message', 'SSO configuration is unavailable');
    expect(JSON.stringify(error)).not.toContain('synthetic-private-pro-token');

    mocks.get.mockResolvedValueOnce({ enabled: 'true' });
    await expect(getSsoConfigured()).rejects.toThrow('SSO configuration is unavailable');
    mocks.get.mockResolvedValueOnce({ enabled: true, isWecom: 'yes' });
    await expect(getSsoConfig()).rejects.toThrow('SSO configuration is unavailable');
    global.getSsoConfiguredHandler = () => 'true' as unknown as boolean;
    await expect(getSsoConfigured()).rejects.toThrow('SSO configuration is unavailable');
  });
});
