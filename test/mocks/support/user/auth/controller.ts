import { vi } from 'vitest';

// Mock auth code validation
vi.mock('@fastgpt/service/support/user/auth/controller', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    authCode: vi.fn().mockResolvedValue(true)
  };
});
