import { vi } from 'vitest';

/**
 * Mock system configuration for testing
 */
vi.mock(import('@/service/common/system'), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSystemVersion: async () => {
      return '0.0.0';
    },
    initSystemConfig: async () => {
      return;
    }
  };
});
