/*
  get plugin preview modules
 */
import { getClientToolPreviewNode } from '@fastgpt/service/core/app/tool/utils/client';
import { type FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetPreviewNodeQuerySchema,
  GetPreviewNodeResponseSchema,
  type GetPreviewNodeQuery
} from '@fastgpt/global/openapi/core/app/tool/api';

async function handler(
  req: ApiRequestProps<Record<string, never>, GetPreviewNodeQuery>
): Promise<FlowNodeTemplateType> {
  const {
    query: { appId, versionId, getLatestVersion }
  } = parseApiInput({
    req,
    querySchema: GetPreviewNodeQuerySchema
  });

  const { authAppId } = splitCombineToolId(appId);
  if (authAppId) {
    await authApp({ req, authToken: true, appId: authAppId, per: ReadPermissionVal });
  }

  return GetPreviewNodeResponseSchema.parse(
    await getClientToolPreviewNode({
      appId,
      versionId,
      getLatestVersion,
      lang: getLocale(req)
    })
  );
}

export default NextAPI(handler);
