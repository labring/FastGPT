import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getLicenseData: vi.fn() }));
vi.mock('@/web/admin/license/api', () => ({ getLicenseData: mocks.getLicenseData }));
vi.mock('@/web/common/system/api', () => ({ getOperationalAd: vi.fn() }));

describe('initLicenseData', () => {
  let useSystemStore: typeof import('@/web/common/system/useSystemStore').useSystemStore;
  let initialState: ReturnType<typeof useSystemStore.getState>;

  beforeAll(async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    });
    ({ useSystemStore } = await import('@/web/common/system/useSystemStore'));
    initialState = useSystemStore.getState();
  });

  beforeEach(() => {
    useSystemStore.setState(initialState, true);
    mocks.getLicenseData.mockReset();
  });

  afterAll(() => {
    useSystemStore.setState(initialState, true);
    vi.unstubAllGlobals();
  });

  it('does not call Pro for an unknown edition or community edition', async () => {
    await useSystemStore.getState().initLicenseData();
    expect(mocks.getLicenseData).not.toHaveBeenCalled();
    expect(useSystemStore.getState().licenseLoading).toBe(false);

    // 模拟持久化的旧商业版配置，匿名响应不能将其视作当前版本。
    useSystemStore.setState({
      feConfigs: { ...initialState.feConfigs, isProService: true },
      licenseLoading: false
    });
    useSystemStore.getState().initStaticData({ feConfigs: {} });
    expect(useSystemStore.getState().feConfigs.isProService).toBeUndefined();
    expect(useSystemStore.getState().licenseLoading).toBe(true);

    useSystemStore.getState().initStaticData({ feConfigs: { isProService: false } });
    await useSystemStore.getState().initLicenseData();
    expect(mocks.getLicenseData).not.toHaveBeenCalled();
    expect(useSystemStore.getState()).toMatchObject({
      licenseData: undefined,
      licenseLoading: false
    });
  });

  it('waits for the current Pro response and ignores a response from before an edition change', async () => {
    let resolveOld!: (value: unknown) => void;
    let resolveCurrent!: (value: unknown) => void;
    mocks.getLicenseData
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveCurrent = resolve)));

    useSystemStore.getState().initStaticData({ feConfigs: { isProService: true } });
    expect(useSystemStore.getState().licenseLoading).toBe(true);
    const oldRequest = useSystemStore.getState().initLicenseData();
    await vi.waitFor(() => expect(mocks.getLicenseData).toHaveBeenCalledTimes(1));

    useSystemStore.getState().initStaticData({ feConfigs: {} });
    useSystemStore.getState().initStaticData({ feConfigs: { isProService: true } });
    const currentRequest = useSystemStore.getState().initLicenseData();
    await vi.waitFor(() => expect(mocks.getLicenseData).toHaveBeenCalledTimes(2));

    resolveOld({ label: 'stale' });
    await oldRequest;
    expect(useSystemStore.getState().licenseData).toBeUndefined();
    expect(useSystemStore.getState().licenseLoading).toBe(true);

    resolveCurrent({ label: 'current' });
    await currentRequest;
    expect(useSystemStore.getState().licenseData).toEqual({ label: 'current' });
    expect(useSystemStore.getState().licenseLoading).toBe(false);
  });

  it('settles a failed Pro request without granting a license', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      useSystemStore.getState().initStaticData({ feConfigs: { isProService: true } });
      mocks.getLicenseData.mockRejectedValueOnce(new Error('unavailable'));
      await useSystemStore.getState().initLicenseData();
      expect(useSystemStore.getState().licenseData).toBeUndefined();
      expect(useSystemStore.getState().licenseLoading).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});
