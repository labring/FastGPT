import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { PostWorkflowDebugProps, PostWorkflowDebugResponse } from '@/global/core/workflow/api';

export const postWorkflowDebug = (data: PostWorkflowDebugProps) =>
  POST<PostWorkflowDebugResponse>(
    '/core/workflow/debug',
    {
      ...data,
      mode: 'debug'
    },
    {
      timeout: 300000
    }
  );
