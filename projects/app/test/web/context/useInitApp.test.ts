import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInitApp } from '@/web/context/useInitApp';

const mocks = vi.hoisted(() => ({
  router: {
    isReady: false,
    query: {} as Record<string, string>,
    pathname: '/',
    replace: vi.fn()
  },
  effects: [] as Array<() => void>,
  setBdVId: vi.fn(),
  setMsclkid: vi.fn(),
  setUtmWorkflow: vi.fn(),
  initFastGPTSemSourceDomain: vi.fn(),
  setUtmParams: vi.fn(),
  setFastGPTSem: vi.fn(),
  setCouponCode: vi.fn()
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: (effect: () => void) => {
    mocks.effects.push(effect);
  },
  useRef: <T>(value?: T) => ({ current: value })
}));

vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));

vi.mock('ahooks', () => ({
  useMemoizedFn: (fn: any) => fn,
  useMount: vi.fn()
}));

vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: vi.fn()
}));

vi.mock('@/web/common/system/staticData', () => ({
  clientInitData: vi.fn().mockResolvedValue({ feConfigs: {} })
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    loadGitStar: vi.fn(),
    setInitd: vi.fn(),
    feConfigs: {}
  })
}));

vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: null })
}));

vi.mock('@/web/support/marketing/utils', () => ({
  setBdVId: mocks.setBdVId,
  setFastGPTSem: mocks.setFastGPTSem,
  initFastGPTSemSourceDomain: mocks.initFastGPTSemSourceDomain,
  setMsclkid: mocks.setMsclkid,
  setUtmParams: mocks.setUtmParams,
  setUtmWorkflow: mocks.setUtmWorkflow,
  setCouponCode: mocks.setCouponCode
}));

describe('useInitApp marketing params readiness gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects.length = 0;
    mocks.router.isReady = false;
    mocks.router.query = {};
    mocks.router.replace.mockClear();
    vi.stubGlobal('window', { location: { hash: '' } });
  });

  it('does not consume marketing params before router.isReady', () => {
    mocks.router.isReady = false;
    mocks.router.query = { bd_vid: 'test-bd-vid', couponCode: 'SAVE20' };

    useInitApp();

    // Trigger registered useEffects
    mocks.effects.forEach((effect) => effect());

    expect(mocks.setBdVId).not.toHaveBeenCalled();
    expect(mocks.setCouponCode).not.toHaveBeenCalled();
  });

  it('consumes marketing params after router.isReady becomes true', () => {
    mocks.router.isReady = true;
    mocks.router.query = {
      bd_vid: 'test-bd-vid',
      couponCode: 'SAVE20',
      utm_source: 'google'
    };

    useInitApp();

    mocks.effects.forEach((effect) => effect());

    expect(mocks.setBdVId).toHaveBeenCalledWith('test-bd-vid');
    expect(mocks.setCouponCode).toHaveBeenCalledWith('SAVE20');
    expect(mocks.setFastGPTSem).toHaveBeenCalledWith(
      expect.objectContaining({
        shortUrlSource: 'google'
      })
    );
  });
});
