import type { NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { getSystemPluginTemplates } from '@fastgpt/plugins/register';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';

export type GetSystemPluginTemplatesQuery = {
  parentId: ParentIdType;
};

async function handler(
  req: ApiRequestProps<{}, GetSystemPluginTemplatesQuery>,
  res: NextApiResponse<any>
): Promise<NodeTemplateListItemType[]> {
  await authCert({ req, authToken: true });

  const { parentId } = req.query;

  const formatParentId = parentId || null;

  return getSystemPluginTemplates().then((res) =>
    res
      // Just show the active plugins
      .filter((item) => item.isActive)
      .map<NodeTemplateListItemType>((plugin) => ({
        id: plugin.id,
        isFolder: plugin.isFolder,
        parentId: plugin.parentId,
        templateType: plugin.templateType ?? FlowNodeTemplateTypeEnum.other,
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        avatar: plugin.avatar,
        name: plugin.name,
        intro: plugin.intro,
        isTool: plugin.isTool,
        currentCost: plugin.currentCost,
        author: plugin.author
      }))
      .filter((item) => item.parentId === formatParentId)
  );
}

export default NextAPI(handler);
