import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null)
  };
})();
vi.stubGlobal('localStorage', localStorageMock);

// Mock utils before importing workflowDemoTrack
vi.mock('@/web/common/middle/tracks/utils', () => ({
  webPushTrack: {
    workflowDemoMode: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-session-id')
}));

import { workflowDemoTrack } from '@/web/common/middle/tracks/workflowDemoTrack';
import { webPushTrack } from '@/web/common/middle/tracks/utils';

const STORAGE_KEY = 'workflowDemoTrack';

describe('workflowDemoTrack', () => {
  beforeEach(() => {
    // Reset singleton state from previous test
    workflowDemoTrack.report();
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize trackData with appId, sessionId, and nodeCount', async () => {
      await workflowDemoTrack.init('app_123', 10);

      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY) || '{}');
      expect(stored.appId).toBe('app_123');
      expect(stored.sessionId).toBe('mock-session-id');
      expect(stored.initNodeCount).toBe(10);
      expect(stored.demoSessions).toEqual([]);
    });

    it('should recover and report leftover data from previous session', async () => {
      const leftover = {
        appId: 'old_app',
        sessionId: 'old-session',
        initNodeCount: 5,
        demoSessions: [{ nodeCount: 5, duration: 3000 }]
      };
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(leftover));

      await workflowDemoTrack.init('app_123', 10);

      expect(webPushTrack.workflowDemoMode).toHaveBeenCalledWith(leftover);
      // After recovery, new session should be stored
      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY) || '{}');
      expect(stored.appId).toBe('app_123');
    });

    it('should clear invalid leftover data from localStorage', async () => {
      localStorageMock.setItem(STORAGE_KEY, 'invalid json{{{');

      await workflowDemoTrack.init('app_123', 10);

      // Should not throw, and new session should be stored
      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY) || '{}');
      expect(stored.appId).toBe('app_123');
    });
  });

  describe('onDemoChange', () => {
    it('should record demo session when toggled on then off', async () => {
      await workflowDemoTrack.init('app_123', 10);

      const startTime = 1000000;
      vi.spyOn(Date, 'now').mockReturnValueOnce(startTime);
      workflowDemoTrack.onDemoChange(true, 10);

      vi.spyOn(Date, 'now').mockReturnValueOnce(startTime + 5000);
      workflowDemoTrack.onDemoChange(false, 10);

      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY) || '{}');
      expect(stored.demoSessions).toHaveLength(1);
      expect(stored.demoSessions[0]).toEqual({ nodeCount: 10, duration: 5000 });
    });

    it('should record multiple demo sessions', async () => {
      await workflowDemoTrack.init('app_123', 10);

      const t0 = 1000000;
      vi.spyOn(Date, 'now').mockReturnValueOnce(t0);
      workflowDemoTrack.onDemoChange(true, 10);
      vi.spyOn(Date, 'now').mockReturnValueOnce(t0 + 3000);
      workflowDemoTrack.onDemoChange(false, 10);

      vi.spyOn(Date, 'now').mockReturnValueOnce(t0 + 10000);
      workflowDemoTrack.onDemoChange(true, 15);
      vi.spyOn(Date, 'now').mockReturnValueOnce(t0 + 18000);
      workflowDemoTrack.onDemoChange(false, 15);

      const stored = JSON.parse(localStorageMock.getItem(STORAGE_KEY) || '{}');
      expect(stored.demoSessions).toHaveLength(2);
      expect(stored.demoSessions[0]).toEqual({ nodeCount: 10, duration: 3000 });
      expect(stored.demoSessions[1]).toEqual({ nodeCount: 15, duration: 8000 });
    });

    it('should do nothing if not initialized', () => {
      workflowDemoTrack.onDemoChange(true, 10);
      expect(localStorageMock.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('report', () => {
    it('should call webPushTrack.workflowDemoMode with aggregated data', async () => {
      await workflowDemoTrack.init('app_123', 10);
      vi.mocked(webPushTrack.workflowDemoMode).mockClear();

      workflowDemoTrack.report();

      expect(webPushTrack.workflowDemoMode).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'app_123',
          sessionId: 'mock-session-id',
          initNodeCount: 10,
          demoSessions: []
        })
      );
    });

    it('should auto-close open demo session before reporting', async () => {
      await workflowDemoTrack.init('app_123', 10);

      const t0 = 1000000;
      vi.spyOn(Date, 'now').mockReturnValueOnce(t0);
      workflowDemoTrack.onDemoChange(true, 12);

      vi.mocked(webPushTrack.workflowDemoMode).mockClear();
      vi.spyOn(Date, 'now').mockReturnValueOnce(t0 + 7000);
      workflowDemoTrack.report();

      const reportedData = vi.mocked(webPushTrack.workflowDemoMode).mock.calls[0][0];
      expect(reportedData.demoSessions).toHaveLength(1);
      expect(reportedData.demoSessions[0]).toEqual({ nodeCount: 12, duration: 7000 });
    });

    it('should clear localStorage after successful report', async () => {
      vi.mocked(webPushTrack.workflowDemoMode).mockResolvedValue(undefined);

      await workflowDemoTrack.init('app_123', 10);
      workflowDemoTrack.report();

      // Wait for the promise chain to resolve
      await vi.waitFor(() => {
        expect(localStorageMock.getItem(STORAGE_KEY)).toBeNull();
      });
    });

    it('should keep localStorage if report fails', async () => {
      await workflowDemoTrack.init('app_123', 10);

      vi.mocked(webPushTrack.workflowDemoMode).mockRejectedValueOnce(new Error('network'));
      workflowDemoTrack.report();

      // Wait for the rejected promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      // localStorage should still have data since report failed
      expect(localStorageMock.getItem(STORAGE_KEY)).not.toBeNull();
    });

    it('should do nothing if not initialized', () => {
      workflowDemoTrack.report();
      expect(webPushTrack.workflowDemoMode).not.toHaveBeenCalled();
    });
  });
});
