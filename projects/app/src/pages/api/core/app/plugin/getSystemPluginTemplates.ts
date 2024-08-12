import type { NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { getSystemPlugins } from '@/service/core/app/plugin';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

export type GetSystemPluginTemplatesBody = {
  searchKey?: string;
  parentId: ParentIdType;
};

async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>,
  res: NextApiResponse<any>
): Promise<NodeTemplateListItemType[]> {
  await authCert({ req, authToken: true });

  const { searchKey, parentId } = req.body;

  const formatParentId = parentId || null;

  return getSystemPlugins().then((res) =>
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
      .filter((item) => {
        if (searchKey) {
          if (item.isFolder) return false;
          const regx = new RegExp(`${replaceRegChars(searchKey)}`, 'i');
          return regx.test(item.name) || regx.test(item.intro || '');
        }
        return item.parentId === formatParentId;
      })
  );
}

export default NextAPI(handler);
