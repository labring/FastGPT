import { describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import {
  onSystemInstanceConfigSnapshot,
  publishSystemInstanceConfigSnapshot
} from '@fastgpt/service/common/system/systemInstanceConfig/runtime';

describe('onSystemInstanceConfigSnapshot', () => {
  it('notifies subscribers with the published snapshot and supports unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = onSystemInstanceConfigSnapshot(listener);
    const snapshot = resolveSystemInstanceConfig({});

    publishSystemInstanceConfigSnapshot({ snapshot, versionTag: 'test-v1' });
    expect(listener).toHaveBeenCalledWith(snapshot);

    unsubscribe();
    publishSystemInstanceConfigSnapshot({ snapshot, versionTag: 'test-v2' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing subscriber from the other subscribers and the publish call', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const healthy = vi.fn();
    const unsubscribeThrowing = onSystemInstanceConfigSnapshot(() => {
      throw new Error('listener boom');
    });
    const unsubscribeHealthy = onSystemInstanceConfigSnapshot(healthy);

    const snapshot = resolveSystemInstanceConfig({});
    expect(() => publishSystemInstanceConfigSnapshot({ snapshot })).not.toThrow();
    expect(healthy).toHaveBeenCalledWith(snapshot);

    unsubscribeThrowing();
    unsubscribeHealthy();
    consoleError.mockRestore();
  });
});
