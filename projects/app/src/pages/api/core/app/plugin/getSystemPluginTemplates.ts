import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { getCommunityPluginsTemplateList } from '@fastgpt/plugins/register';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<NodeTemplateListItemType[]> {
  await authCert({ req, authToken: true });

  // const data: NodeTemplateListItemType[] =
  //   global.communityPlugins?.map((plugin) => ({
  //     id: plugin.id,
  //     templateType: plugin.templateType ?? FlowNodeTemplateTypeEnum.other,
  //     flowNodeType: FlowNodeTypeEnum.pluginModule,
  //     avatar: plugin.avatar,
  //     name: plugin.name,
  //     intro: plugin.intro
  //   })) || [];

  return getCommunityPluginsTemplateList();
}

export default NextAPI(handler);
