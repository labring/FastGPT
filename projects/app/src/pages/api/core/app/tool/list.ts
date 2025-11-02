import { NextAPI } from '@/service/middleware/entry';
import type { AppToolTemplateListItemType } from '@fastgpt/global/core/app/tool/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { getSystemTools } from '@fastgpt/service/core/app/plugin/controller';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import type { InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import type { SystemPluginConfigSchemaType } from '@fastgpt/service/core/app/plugin/type';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/app/plugin/teamInstalledPluginSchema';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';

export type getSystemPluginsQuery = {
  parentId?: string;
  source?: 'admin' | 'team';
};

export type getSystemPluginsBody = {};

export type getSystemPluginsResponse = Array<
  AppToolTemplateListItemType & { isInstalled?: boolean }
>;

async function handler(
  req: ApiRequestProps<getSystemPluginsBody, getSystemPluginsQuery>,
  res: ApiResponseType<any>
): Promise<getSystemPluginsResponse> {
  const lang = getLocale(req);
  const { parentId, source } = req.query;

  const { teamId, isRoot } = await (source === 'team'
    ? authCert({ req, authToken: true })
    : authSystemAdmin({ req }));

  const allSystemTools = await getSystemTools();
  let systemTools = parentId
    ? allSystemTools.filter((item) => item.parentId === parentId)
    : allSystemTools.filter((item) => !item.parentId);

  if (source === 'team' && teamId) {
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

    systemTools = systemTools.filter((plugin) => {
      if (installedSet.has(plugin.id)) {
        // @ts-ignore
        plugin.isInstalled = true;
        return true;
      }
      // 管理员用户从插件市场安装后，资源库默认安装，减少重复安装
      if (isRoot && !uninstalledSet.has(plugin.id)) {
        // @ts-ignore
        plugin.isInstalled = true;
        return true;
      }

      return plugin.status === 1 || plugin.status === undefined;
    });
  }

  const dbPlugins = await MongoSystemTool.find()
    .lean()
    .then((res) => {
      const map = new Map<string, SystemPluginConfigSchemaType>();
      res.forEach((item) => {
        map.set(String(item.pluginId), item);
      });
      return map;
    });

  const allTags = await MongoPluginToolTag.find().sort({ tagOrder: 1 }).lean();
  const tagMap = new Map<string, SystemPluginToolTagType>();
  allTags.forEach((tag) => {
    tagMap.set(tag.tagId, tag);
  });

  return systemTools.map((item) => {
    const dbPlugin = dbPlugins.get(String(item.id));

    const formattedInputList = item.inputList?.map((cfg: InputConfigType) => {
      const value = dbPlugin?.inputListVal?.[cfg.key] ?? '';

      return {
        ...cfg,
        value
      };
    });

    const toolTags = dbPlugin?.customConfig?.toolTags || item.toolTags;
    const tags = toolTags
      ? toolTags
          .map((tagId) => tagMap.get(tagId))
          .filter((tag): tag is SystemPluginToolTagType => tag !== undefined)
      : [];

    return {
      ...item,
      name: parseI18nString(item.name, lang),
      intro: parseI18nString(item.intro, lang),
      toolDescription: parseI18nString(item.toolDescription, lang),
      inputList: formattedInputList,
      inputListVal: dbPlugin?.inputListVal,
      toolTags,
      tags,
      versionList: item.versionList
    };
  });
}

export default NextAPI(handler);
