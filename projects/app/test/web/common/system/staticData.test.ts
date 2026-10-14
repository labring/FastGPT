import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import {
  beginLogout,
  resetLogoutState,
  setPendingLogoutRequest
} from '@/web/support/user/logoutState';

const mocks = vi.hoisted(() => ({
  getSystemInitData: vi.fn(),
  initStaticData: vi.fn(),
  authGeneration: 0,
  feConfigs: undefined as GetSystemInitDataResponse['feConfigs']
}));

vi.mock('@/web/common/system/api', () => ({
  getSystemInitData: mocks.getSystemInitData
}));

vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: { getState: () => ({ authGeneration: mocks.authGeneration }) }
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: {
    getState: () => ({
      initDataBufferId: 'buffer_1',
      feConfigs: mocks.feConfigs,
      initStaticData: mocks.initStaticData
    })
  }
}));

const { clientInitData } = await import('@/web/common/system/staticData');

/** 由测试显式释放传输响应，用于验证会话切换和乱序完成。 */
const deferResponse = <T = GetSystemInitDataResponse>() => {
  let resolve!: (response: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
};

describe('clientInitData request snapshots and retries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mocks.authGeneration = 0;
    resetLogoutState();
    mocks.feConfigs = {
      limit: { uploadFileMaxAmount: 7, uploadFileMaxSize: 32 },
      systemTitle: 'cached'
    };
    mocks.initStaticData.mockImplementation((response: GetSystemInitDataResponse) => {
      mocks.feConfigs = response.feConfigs ?? mocks.feConfigs;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetLogoutState();
  });

  it('waits 500 ms between retries and commits new data only after the last allowed attempt succeeds', async () => {
    const response = {
      feConfigs: {
        limit: { uploadFileMaxAmount: 3, uploadFileMaxSize: 16 },
        systemTitle: 'FastGPT'
      }
    };
    mocks.getSystemInitData
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockRejectedValueOnce(new Error('Second attempt failed'))
      .mockRejectedValueOnce(new Error('Third attempt failed'))
      .mockResolvedValueOnce(response);

    const pending = clientInitData();
    await vi.advanceTimersByTimeAsync(499);
    expect(mocks.getSystemInitData).toHaveBeenCalledExactlyOnceWith('buffer_1');
    expect(mocks.initStaticData).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(3);
    expect(mocks.initStaticData).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toEqual({ feConfigs: response.feConfigs });
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(4);
    expect(mocks.initStaticData).toHaveBeenCalledExactlyOnceWith(response, {
      authGeneration: 0
    });
  });

  it('rejects the final error after exhausting the default retry budget without writing data', async () => {
    const finalError = new Error('Service still unavailable');
    mocks.getSystemInitData
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockRejectedValue(finalError);

    // 先附上 rejection 断言，避免推进计时器时产生未处理的 Promise 拒绝。
    const rejected = expect(clientInitData()).rejects.toBe(finalError);
    await vi.runAllTimersAsync();
    await rejected;

    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(4);
    expect(mocks.initStaticData).not.toHaveBeenCalled();
  });

  it('does not schedule a retry when the caller disables retries', async () => {
    const error = new Error('Request failed');
    mocks.getSystemInitData.mockRejectedValueOnce(error);

    await expect(clientInitData(0)).rejects.toBe(error);

    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
    expect(mocks.initStaticData).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns an empty configuration when neither the response nor the cache has one', async () => {
    mocks.feConfigs = undefined;
    mocks.getSystemInitData.mockResolvedValueOnce({ bufferId: 'buffer_1' });

    expect(await clientInitData()).toEqual({ feConfigs: {} });
  });

  it.each(['success', 'failure'] as const)(
    'ignores an older request %s after the newest request has committed',
    async (completion) => {
      const older = deferResponse();
      const response = {
        isAuthenticated: false,
        feConfigs: {
          limit: { uploadFileMaxAmount: 3, uploadFileMaxSize: 16 },
          systemTitle: 'newest'
        }
      };
      mocks.getSystemInitData.mockReturnValueOnce(older.promise).mockResolvedValueOnce(response);
      const pending = clientInitData();
      mocks.authGeneration += 1;
      await clientInitData();

      if (completion === 'success') {
        older.resolve({
          isAuthenticated: true,
          feConfigs: { ...response.feConfigs, show_pay: true }
        });
      } else {
        older.reject(new Error('Old request failed'));
      }

      expect(await pending).toEqual({ feConfigs: response.feConfigs });
      expect(mocks.initStaticData).toHaveBeenCalledExactlyOnceWith(response, {
        authGeneration: 1
      });
      expect(mocks.getSystemInitData).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each([true, false])(
    'ignores a previous-session response before replacement starts, with cache=%s',
    async (hasCache) => {
      if (!hasCache) mocks.feConfigs = undefined;
      const older = deferResponse();
      const cachedConfig = mocks.feConfigs;
      mocks.getSystemInitData.mockReturnValueOnce(older.promise);
      const pending = clientInitData();
      mocks.authGeneration += 1;
      older.resolve({
        isAuthenticated: true,
        feConfigs: { limit: { uploadFileMaxAmount: 3, uploadFileMaxSize: 16 } }
      });

      expect(await pending).toEqual({ feConfigs: cachedConfig ?? {} });
      expect(mocks.initStaticData).not.toHaveBeenCalled();
    }
  );

  it('does not restart an obsolete request when its retry delay ends', async () => {
    const response = {
      isAuthenticated: false,
      feConfigs: { limit: { uploadFileMaxAmount: 3, uploadFileMaxSize: 16 }, systemTitle: 'newest' }
    };
    mocks.getSystemInitData
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce(response);
    const pending = clientInitData();
    await vi.advanceTimersByTimeAsync(499);
    mocks.authGeneration += 1;
    await clientInitData();
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ feConfigs: response.feConfigs });
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(2);
    expect(mocks.initStaticData).toHaveBeenCalledExactlyOnceWith(response, {
      authGeneration: 1
    });
  });

  it('shares an in-flight request within one session and starts a fresh request after completion', async () => {
    const response = {
      isAuthenticated: false,
      feConfigs: { limit: { uploadFileMaxAmount: 3, uploadFileMaxSize: 16 } }
    };
    const held = deferResponse();
    mocks.getSystemInitData.mockReturnValueOnce(held.promise).mockResolvedValueOnce(response);
    const first = clientInitData();
    const second = clientInitData();
    expect(second).toBe(first);
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
    held.resolve(response);
    await first;
    await clientInitData();
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    'reuses a pending ordinary initialization and only supplements missing plans: hasPlans=%s',
    async (hasPlans) => {
      const held = deferResponse();
      const response = {
        isAuthenticated: true,
        feConfigs: { limit: { uploadFileMaxAmount: 3, uploadFileMaxSize: 16 } }
      };
      mocks.getSystemInitData.mockReturnValueOnce(held.promise).mockResolvedValueOnce(response);
      const ordinary = clientInitData();
      const price = clientInitData(3, true);
      expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
      held.resolve({
        ...response,
        ...(hasPlans && { subPlans: { extraDatasetSize: { price: 4 } } })
      });
      await ordinary;
      await price;
      expect(mocks.getSystemInitData).toHaveBeenCalledTimes(hasPlans ? 1 : 2);
      if (!hasPlans) expect(mocks.getSystemInitData).toHaveBeenLastCalledWith('buffer_1', true);
    }
  );

  it('does not restore authenticated data while the logout Cookie is still being cleared', async () => {
    const cachedConfig = mocks.feConfigs;
    beginLogout();
    mocks.getSystemInitData.mockResolvedValueOnce({
      isAuthenticated: true,
      feConfigs: { limit: { uploadFileMaxAmount: 3, uploadFileMaxSize: 16 }, show_pay: true }
    });

    expect(await clientInitData()).toEqual({ feConfigs: cachedConfig });
    expect(mocks.initStaticData).not.toHaveBeenCalled();
  });

  it('waits for logout Cookie clearing before requesting anonymous configuration', async () => {
    const logout = deferResponse<void>();
    beginLogout();
    setPendingLogoutRequest(logout.promise);
    const response = { isAuthenticated: false, feConfigs: { systemTitle: 'anonymous' } };
    mocks.getSystemInitData.mockResolvedValueOnce(response);
    const pending = clientInitData();
    expect(mocks.getSystemInitData).not.toHaveBeenCalled();
    logout.resolve();
    expect(await pending).toEqual({ feConfigs: response.feConfigs });
    expect(mocks.getSystemInitData).toHaveBeenCalledTimes(1);
  });
});
