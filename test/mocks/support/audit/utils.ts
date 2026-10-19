import { vi } from 'vitest';

vi.mock('@fastgpt/service/support/user/audit/util', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    addAuditLog: vi.fn().mockResolvedValue(true),
    upsertAuditLogByTaskId: vi.fn().mockResolvedValue(true),
    updateAuditLogByTaskId: vi.fn().mockResolvedValue(undefined)
  };
});
