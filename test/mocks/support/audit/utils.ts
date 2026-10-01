import { vi } from 'vitest';

vi.mock('@fastgpt/service/support/user/audit/util', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    addAuditLog: vi.fn().mockResolvedValue(undefined),
    updateAuditLogByTaskId: vi.fn().mockResolvedValue(undefined)
  };
});
