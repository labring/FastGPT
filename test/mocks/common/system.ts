import { vi } from 'vitest';
import { readFileSync } from 'fs';

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
    readConfigData: async () => {
      return readFileSync('projects/app/data/config.json', 'utf-8');
    },
    initSystemConfig: async () => {
      // read env from projects/app/.env
      const str = readFileSync('projects/app/.env.local', 'utf-8');
      const lines = str.split('\n');
      const systemEnv: Record<string, string> = {};
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key && value) {
          systemEnv[key] = value;
        }
      }
      global.systemEnv = systemEnv as any;

      return;
    }
  };
});
