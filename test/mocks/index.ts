import { vi } from 'vitest';
import './request';

vi.mock(import('@fastgpt/service/support/audit/util'), () => {
  return {
    addAuditLog: vi.fn()
  };
});
