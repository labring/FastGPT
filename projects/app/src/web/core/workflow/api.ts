import { GET, POST } from '@/web/common/api/request';
import type {
  GetSandboxPackagesResponse,
  WorkflowDebugBody,
  WorkflowDebugResponse
} from '@fastgpt/global/openapi/core/workflow/api';

/** 获取代码沙盒支持的依赖与内置全局变量，调用方通过 TanStack Query 缓存复用。 */
export const getSandboxPackages = () =>
  GET<GetSandboxPackagesResponse>('/core/workflow/getSandboxPackages', {}, { deduplicate: true });

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
