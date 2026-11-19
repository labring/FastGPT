import type { GetSandboxPackagesResponse } from '@fastgpt/global/openapi/core/workflow/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { createSuccessResult } from '../../shared/result';

/** 查询当前 FastGPT 实例的代码沙盒依赖和内置全局对象。 */
export async function listCodeSandboxPackages(client: FastGptHttpClient) {
  const data = await client.request<GetSandboxPackagesResponse>({
    method: 'GET',
    path: '/core/workflow/getSandboxPackages'
  });
  return createSuccessResult({ data });
}
