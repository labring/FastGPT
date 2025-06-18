import { vi } from 'vitest';
import './request';

vi.mock(import('@fastgpt/service/support/audit/util'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    addAuditLog: vi.fn()
  };
});
