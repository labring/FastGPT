import { type NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { NextApiResponse } from 'next';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getSystemPlugins } from '@fastgpt/service/core/app/plugin/controller';

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

  const plugins = await getSystemPlugins();

  return plugins // Just show the active plugins
    .filter((item) => item.isActive)
    .map<NodeTemplateListItemType>((plugin) => ({
      ...plugin,
      parentId: plugin.parentId === undefined ? null : plugin.parentId,
      templateType: plugin.templateType ?? FlowNodeTemplateTypeEnum.other,
      flowNodeType: FlowNodeTypeEnum.tool,
      name: parseI18nString(plugin.name, lang),
      intro: parseI18nString(plugin.intro ?? '', lang)
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
