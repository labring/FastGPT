import { type NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { NextApiResponse } from 'next';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getSystemTools } from '@fastgpt/service/core/app/plugin/controller';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/app/plugin/teamInstalledPluginSchema';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';

export type GetSystemPluginTemplatesBody = {
  searchKey?: string;
  parentId?: ParentIdType;
};

async function handler(
  req: ApiRequestProps<GetSystemPluginTemplatesBody>,
  _res: NextApiResponse<any>
): Promise<NodeTemplateListItemType[]> {
  const { teamId, isRoot } = await authCert({ req, authToken: true });
  const { searchKey, parentId } = req.body;
  const formatParentId = parentId || null;
  const lang = getLocale(req);

  const plugins = await getSystemTools();

  const records = await MongoTeamInstalledPlugin.find({ teamId }).lean();
  const installedSet = new Set<string>();
  const uninstalledSet = new Set<string>();

  records.forEach((record) => {
    if (record.installed) {
      installedSet.add(record.pluginId);
    } else {
      uninstalledSet.add(record.pluginId);
    }
  });

  return plugins
    .filter((plugin) => {
      if (plugin.parentId) return true;
      if (plugin.status !== PluginStatusEnum.Normal) {
        return false;
      }
      if (uninstalledSet.has(plugin.id)) {
        return false;
      }
      if (installedSet.has(plugin.id)) {
        return true;
      }
      // 管理员用户从插件市场安装后，资源库默认安装，减少重复安装
      if (isRoot) {
        return true;
      }

      return !!plugin.defaultInstalled;
    })
    .map<NodeTemplateListItemType>((plugin) => ({
      ...plugin,
      parentId: plugin.parentId === undefined ? null : plugin.parentId,
      templateType: plugin.templateType ?? FlowNodeTemplateTypeEnum.other,
      flowNodeType: plugin.isFolder ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
      name: parseI18nString(plugin.name, lang),
      intro: parseI18nString(plugin.intro ?? '', lang),
      instructions: parseI18nString(plugin.userGuide ?? '', lang),
      toolDescription: plugin.toolDescription,
      toolTags: plugin.toolTags
    }))
    .filter((item) => {
      if (searchKey) {
        const regex = new RegExp(`${replaceRegChars(searchKey)}`, 'i');
        return regex.test(String(item.name)) || regex.test(String(item.intro || ''));
      }
      return item.parentId === formatParentId;
    });
}

export default NextAPI(handler);
