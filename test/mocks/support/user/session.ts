import { vi } from 'vitest';

// Mock user session creation
vi.mock('@fastgpt/service/support/user/session', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createUserSession: vi.fn().mockResolvedValue('mock-session-token')
  };
});
