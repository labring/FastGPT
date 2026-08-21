import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type {
  WorkflowDebugBody,
  WorkflowDebugResponse
} from '@fastgpt/global/openapi/core/workflow/api';

export const postWorkflowDebug = (data: WorkflowDebugBody) =>
  POST<WorkflowDebugResponse>(
    '/core/workflow/debug',
    {
      ...data,
      mode: 'debug'
    },
    {
      timeout: 300000
    }
  );
