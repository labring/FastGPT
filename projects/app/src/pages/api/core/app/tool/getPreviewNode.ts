/*
  get plugin preview modules
 */
import { getChildAppPreviewNode } from '@fastgpt/service/core/app/tool/controller';
import { type FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { z } from 'zod';

export const GetPreviewNodeQuerySchema = z.object({
  appId: z.string(),
  version: z.string().optional(),
  lockLatestVersion: z
    .union([
      z.boolean(),
      z.enum(['true', 'false']).transform((value) => value === 'true')
    ])
    .optional(),
  keepLatest: z
    .union([
      z.boolean(),
      z.enum(['true', 'false']).transform((value) => value === 'true')
    ])
    .optional()
});

export type GetPreviewNodeQuery = {
  appId: string;
  version?: string;
  lockLatestVersion?: boolean;
  keepLatest?: boolean;
};

async function handler(
  req: ApiRequestProps<{}, GetPreviewNodeQuery>,
  _res: NextApiResponse<any>
): Promise<FlowNodeTemplateType> {
  const {
    query: { appId, version, lockLatestVersion, keepLatest }
  } = parseApiInput({
    req,
    querySchema: GetPreviewNodeQuerySchema
  });

  const { authAppId } = splitCombineToolId(appId);
  if (authAppId) {
    await authApp({ req, authToken: true, appId: authAppId, per: ReadPermissionVal });
  }

  return getChildAppPreviewNode({
    appId,
    versionId: version,
    keepLatest: keepLatest ?? (lockLatestVersion === undefined ? undefined : !lockLatestVersion),
    lang: getLocale(req)
  });
}

export default NextAPI(handler);
