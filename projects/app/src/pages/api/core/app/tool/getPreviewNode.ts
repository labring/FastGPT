/*
  get plugin preview modules
 */
import { getChildAppPreviewNode } from '@fastgpt/service/core/app/tool/controller';
import { type FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';

export type GetPreviewNodeQuery = { appId: string; versionId?: string };

async function handler(
  req: ApiRequestProps<{}, GetPreviewNodeQuery>,
  _res: NextApiResponse<any>
): Promise<FlowNodeTemplateType> {
  const { appId, versionId } = req.query;

  const { source, pluginId } = splitCombineToolId(appId);
  if (source === AppToolSourceEnum.personal) {
    await authApp({ req, authToken: true, appId: pluginId, per: ReadPermissionVal });
  }

  return getChildAppPreviewNode({ appId, versionId, lang: getLocale(req) });
}

export default NextAPI(handler);
