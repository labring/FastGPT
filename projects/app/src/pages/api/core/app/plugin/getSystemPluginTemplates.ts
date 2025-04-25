import { type NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { getSystemPlugins } from '@/service/core/app/plugin';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { parseI18nString } from '@fastgpt/global/core/workflow/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { NextApiResponse } from 'next';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export type GetSystemPluginTemplatesBody = {
  searchKey?: string;
  parentId: ParentIdType;
};

async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>,
  _res: NextApiResponse<any>
): Promise<NodeTemplateListItemType[]> {
  await authCert({ req, authToken: true });
  const { searchKey, parentId } = req.body;
  const formatParentId = parentId || null;
  const lang = getLocale(req);

  // Make sure system plugin callbacks are loaded
  // if (!global.systemPluginCb || Object.keys(global.systemPluginCb).length === 0)
  //   await getSystemPluginCb();

  const plugins = await getSystemPlugins();
  return plugins // Just show the active plugins
    .filter((item) => item.isActive)
    .map<NodeTemplateListItemType>((plugin) => ({
      id: plugin.id,
      isFolder: plugin.isFolder,
      parentId: plugin.parentId === undefined ? null : plugin.parentId,
      templateType: plugin.templateType ?? FlowNodeTemplateTypeEnum.other,
      flowNodeType: plugin.isFolder ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
      avatar: plugin.avatar,
      name: parseI18nString(plugin.name, lang),
      intro: parseI18nString(plugin.intro ?? '', lang),
      isTool: plugin.isTool,
      currentCost: plugin.currentCost,
      hasTokenFee: plugin.hasTokenFee,
      author: plugin.author,
      instructions: plugin.userGuide,
      courseUrl: plugin.courseUrl
    }))
    .filter((item) => {
      if (searchKey) {
        if (item.isFolder) return false;
        const regx = new RegExp(`${replaceRegChars(searchKey)}`, 'i');
        return regx.test(String(item.name)) || regx.test(String(item.intro || ''));
      }
      return item.parentId === formatParentId;
    });
}

export default NextAPI(handler);
