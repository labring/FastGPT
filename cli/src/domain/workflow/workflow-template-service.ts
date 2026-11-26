import { parseLocale } from '@fastgpt/global/common/i18n/utils';
import { GetWorkflowTemplateBundleResponseSchema } from '@fastgpt/global/openapi/core/workflow/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';

/** 请求当前成员的完整模板快照。响应结构通过校验后才能写入工作区。 */
export async function fetchWorkflowTemplateBundle(client: FastGptHttpClient, locale: string) {
  const response = await client.request<unknown>({
    method: 'GET',
    path: '/core/workflow/getTemplateBundle',
    query: { locale: parseLocale(locale) ?? 'en' }
  });
  return GetWorkflowTemplateBundleResponseSchema.parse(response);
}
