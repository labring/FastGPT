import { describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import {
  getSystemConfigRuntimeState,
  onSystemInstanceConfigSnapshot,
  publishSystemInstanceConfigSnapshot
} from '@fastgpt/service/common/system/systemInstanceConfig/runtime';

describe('onSystemInstanceConfigSnapshot', () => {
  it('uses default account/login policies in community and restores configured policies in Pro', () => {
    const state = getSystemConfigRuntimeState();
    const previousContext = state.frontendContext;
    const previousSnapshot = global.systemInstanceConfig;
    const previousFrontend = global.feConfigs;
    const snapshot = resolveSystemInstanceConfig({
      auth: { passwordExpiredMonth: 3, openApiKeyMaxCount: 200 },
      security: { passwordLoginMinuteLimitCount: 20, maxLoginSession: 30, checkInternalIp: true }
    });
    try {
      for (const commercialService of [false, true]) {
        state.frontendContext = { ...previousContext, commercialService };
        publishSystemInstanceConfigSnapshot({ snapshot });
        expect(global.systemInstanceConfig.auth.passwordExpiredMonth).toBe(
          commercialService ? 3 : null
        );
        expect(global.systemInstanceConfig.security).toMatchObject({
          passwordLoginMinuteLimitCount: commercialService ? 20 : 10,
          maxLoginSession: commercialService ? 30 : 10,
          checkInternalIp: true
        });
        expect(global.systemInstanceConfig.auth.openApiKeyMaxCount).toBe(200);
      }
      expect(snapshot.auth.passwordExpiredMonth).toBe(3);
      expect(snapshot.security.maxLoginSession).toBe(30);
    } finally {
      state.frontendContext = previousContext;
      global.systemInstanceConfig = previousSnapshot;
      global.feConfigs = previousFrontend;
    }
  });

  it.each([false, true])(
    'applies cooldowns only to commercial deployments: %s',
    (commercialService) => {
      const state = getSystemConfigRuntimeState();
      const previousContext = state.frontendContext;
      const previousSnapshot = global.systemInstanceConfig;
      const previousFrontend = global.feConfigs;
      const snapshot = resolveSystemInstanceConfig({
        resource: { exportDatasetLimitMinutes: 20, websiteSyncLimitMinuted: 60 },
        vector: { vectorRecallConcurrency: 8 }
      });
      try {
        state.frontendContext = { ...previousContext, commercialService };
        publishSystemInstanceConfigSnapshot({ snapshot });
        expect(global.systemInstanceConfig.resource.exportDatasetLimitMinutes).toBe(
          commercialService ? 20 : 0
        );
        expect(global.systemInstanceConfig.resource.websiteSyncLimitMinuted).toBe(
          commercialService ? 60 : 0
        );
        expect(global.feConfigs.limit?.exportDatasetLimitMinutes).toBe(commercialService ? 20 : 0);
        expect(global.systemInstanceConfig.vector.vectorRecallConcurrency).toBe(8);
        expect(snapshot.resource.exportDatasetLimitMinutes).toBe(20);
      } finally {
        state.frontendContext = previousContext;
        global.systemInstanceConfig = previousSnapshot;
        global.feConfigs = previousFrontend;
      }
    }
  );

  it('notifies subscribers with the published snapshot and supports unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = onSystemInstanceConfigSnapshot(listener);
    const snapshot = resolveSystemInstanceConfig({});

    publishSystemInstanceConfigSnapshot({ snapshot, versionTag: 'test-v1' });
    expect(listener).toHaveBeenCalledWith(global.systemInstanceConfig);

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
    expect(healthy).toHaveBeenCalledWith(global.systemInstanceConfig);

    unsubscribeThrowing();
    unsubscribeHealthy();
    consoleError.mockRestore();
  });
});
