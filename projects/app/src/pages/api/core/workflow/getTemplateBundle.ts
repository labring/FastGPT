import { NextAPI } from '@/service/middleware/entry';
import {
  GetWorkflowTemplateBundleQuerySchema,
  GetWorkflowTemplateBundleResponseSchema,
  type GetWorkflowTemplateBundleQuery,
  type GetWorkflowTemplateBundleResponse
} from '@fastgpt/global/openapi/core/workflow/api';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getWorkflowTemplateContext } from '@fastgpt/service/core/workflow/template/service';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { createWorkflowTemplateBundle } from '@fastgpt/workflow-core/template/bundle';

/** 按当前成员权限生成模板快照，响应只供当前请求使用。 */
export async function handler(
  req: ApiRequestProps<Record<string, never>, GetWorkflowTemplateBundleQuery>,
  res: ApiResponseType<GetWorkflowTemplateBundleResponse>
): Promise<GetWorkflowTemplateBundleResponse> {
  const { query } = parseApiInput({ req, querySchema: GetWorkflowTemplateBundleQuerySchema });
  const { teamId, tmbId, isRoot } = await authCert({ req, authToken: true, authApiKey: true });
  const { bundleOptions } = await getWorkflowTemplateContext({
    teamId: String(teamId),
    tmbId: String(tmbId),
    isRoot,
    locale: query.locale ?? getLocale(req)
  });
  res.setHeader('Cache-Control', 'private, no-store');
  return GetWorkflowTemplateBundleResponseSchema.parse(createWorkflowTemplateBundle(bundleOptions));
}

export default NextAPI(handler);
