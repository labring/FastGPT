import { vi } from 'vitest';
import './request';

vi.mock(import('@fastgpt/service/support/operationLog/addOperationLog'), () => {
  return {
    addOperationLog: vi.fn()
  };
});
