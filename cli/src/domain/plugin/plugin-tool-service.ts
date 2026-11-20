import {
  GetSystemToolTemplatesBodySchema,
  type GetSystemToolTemplatesResponseType
} from '@fastgpt/global/openapi/core/app/tool/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { createSuccessResult } from '../../shared/result';

/** 读取画布可选择的插件工具模板，保留服务端返回的工具 ID 和来源。 */
export async function listPluginTools({
  client,
  input
}: {
  client: FastGptHttpClient;
  input: unknown;
}) {
  const data = await client.request<GetSystemToolTemplatesResponseType>({
    method: 'POST',
    path: '/core/app/tool/getSystemToolTemplates',
    body: GetSystemToolTemplatesBodySchema.parse(input)
  });

  return createSuccessResult({ data });
}
