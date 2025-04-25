/*
  get plugin preview modules
 */
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  getChildAppPreviewNode,
  splitCombineToolId
} from '@fastgpt/service/core/app/plugin/controller';
import { type FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import type { NextApiResponse } from 'next';

export type GetPreviewNodeQuery = { appId: string; versionId?: string };

async function handler(
  req: ApiRequestProps<{}, GetPreviewNodeQuery>,
  _res: NextApiResponse<any>
): Promise<FlowNodeTemplateType> {
  const { appId, versionId } = req.query;

  const { source } = splitCombineToolId(appId);

  if (source === PluginSourceEnum.personal) {
    await authApp({ req, authToken: true, appId, per: ReadPermissionVal });
  }

  return getChildAppPreviewNode({ appId, versionId });
}

export default NextAPI(handler);
