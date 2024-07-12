import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { getSystemPluginTemplates } from '@fastgpt/plugins/register';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<NodeTemplateListItemType[]> {
  await authCert({ req, authToken: true });

  return getSystemPluginTemplates().then((res) =>
    res
      // Just show the active plugins
      .filter((item) => item.isActive)
      .map<NodeTemplateListItemType>((plugin) => ({
        id: plugin.id,
        templateType: plugin.templateType ?? FlowNodeTemplateTypeEnum.other,
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        avatar: plugin.avatar,
        name: plugin.name,
        intro: plugin.intro,
        isTool: plugin.isTool,
        currentCost: plugin.currentCost,
        author: plugin.author
      }))
  );
}

export default NextAPI(handler);
