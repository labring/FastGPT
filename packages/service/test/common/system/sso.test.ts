import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), proUrl: 'http://pro.invalid/api' }));
vi.mock('@fastgpt/service/common/system/constants', () => ({
  get FastGPTProUrl() {
    return mocks.proUrl;
  }
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPro/plusRequest', () => ({ GET: mocks.get }));
import { getSsoIsWecom } from '@fastgpt/service/common/system/sso';
describe('maintenance SSO provider metadata', () => {
  let original: typeof global.systemEnv;
  beforeEach(() => {
    original = global.systemEnv;
    global.systemEnv = { sso: { url: 'http://sso.invalid' } } as typeof global.systemEnv;
    mocks.proUrl = 'http://pro.invalid/api';
    mocks.get.mockReset();
  });
  afterEach(() => {
    global.systemEnv = original;
  });
  it.each([true, false, undefined])('preserves provider state %s', async (isWecom) => {
    mocks.get.mockResolvedValue({ enabled: true, ...(isWecom === undefined ? {} : { isWecom }) });
    expect(await getSsoIsWecom()).toBe(isWecom);
    expect(mocks.get).toHaveBeenCalledWith(
      '/common/system/sso/config',
      { includeProvider: true },
      { timeout: 1500 }
    );
  });
  it('does not probe without configured SSO or Pro', async () => {
    global.systemEnv.sso = undefined;
    expect(await getSsoIsWecom()).toBeUndefined();
    global.systemEnv.sso = { url: 'http://sso.invalid' };
    mocks.proUrl = '';
    expect(await getSsoIsWecom()).toBeUndefined();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each([
    new Error('404'),
    { enabled: true, isWecom: 'invalid' },
    { enabled: false, isWecom: true }
  ])('keeps unknown state for unavailable or invalid provider metadata %s', async (value) => {
    if (value instanceof Error) mocks.get.mockRejectedValue(value);
    else mocks.get.mockResolvedValue(value);
    expect(await getSsoIsWecom()).toBeUndefined();
    expect(global.systemEnv.sso?.url).toBe('http://sso.invalid');
  });
});
