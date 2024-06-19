/* 
  get plugin preview modules 
 */
import type { NextApiResponse } from 'next';
import {
  getPluginPreviewNode,
  splitCombinePluginId
} from '@fastgpt/service/core/app/plugin/controller';
import { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/index.d';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';

export type GetPreviewNodeQuery = { appId: string };

async function handler(
  req: ApiRequestProps<{}, GetPreviewNodeQuery>,
  res: NextApiResponse<any>
): Promise<FlowNodeTemplateType> {
  const { appId } = req.query;

  const { source } = await splitCombinePluginId(appId);

  if (source === PluginSourceEnum.personal) {
    await authApp({ req, authToken: true, appId, per: WritePermissionVal });
  }

  return getPluginPreviewNode({ id: appId });
}

export default NextAPI(handler);
