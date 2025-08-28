import { POST } from '@/web/common/api/request';
import type { TestCodeParams, TestCodeResponse } from '@/pages/api/core/workflow/copilot/testCode';

export const testCode = (params: TestCodeParams): Promise<TestCodeResponse> =>
  POST('/core/workflow/copilot/testCode', params);
