import { NextAPI } from '@/service/middleware/entry';
import type { SystemPluginTemplateListItemType } from '@fastgpt/global/core/app/plugin/type';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { getSystemTools } from '@fastgpt/service/core/app/plugin/controller';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { MongoSystemPlugin } from '@fastgpt/service/core/app/plugin/systemPluginSchema';
import { MongoPluginTag } from '@fastgpt/service/core/app/plugin/pluginTagSchema';
import type { InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import type {
  SystemPluginConfigSchemaType,
  PluginTagSchemaType
} from '@fastgpt/service/core/app/plugin/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type getSystemPluginsQuery = {
  parentId?: string;
};

export type getSystemPluginsBody = {};

export type getSystemPluginsResponse = Array<SystemPluginTemplateListItemType>;

async function handler(
  req: ApiRequestProps<getSystemPluginsBody, getSystemPluginsQuery>,
  res: ApiResponseType<any>
): Promise<getSystemPluginsResponse> {
  await authCert({ req, authToken: true });

  const lang = getLocale(req);
  const { parentId } = req.query;

  const allSystemTools = await getSystemTools();
  const systemTools = parentId
    ? allSystemTools.filter((item) => item.parentId === parentId)
    : allSystemTools.filter((item) => !item.parentId);

  const dbPlugins = await MongoSystemPlugin.find()
    .lean()
    .then((res) => {
      const map = new Map<string, SystemPluginConfigSchemaType>();
      res.forEach((item) => {
        map.set(String(item.pluginId), item);
      });
      return map;
    });

  const allTags = await MongoPluginTag.find().sort({ tagOrder: 1 }).lean();
  const tagMap = new Map<string, PluginTagSchemaType>();
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

    // temp：后续去掉 templateType
    const pluginTags =
      dbPlugin?.customConfig?.pluginTags || (item.templateType ? [item.templateType] : undefined);
    const tags = pluginTags
      ? pluginTags
          .map((tagId) => tagMap.get(tagId))
          .filter((tag): tag is PluginTagSchemaType => tag !== undefined)
      : [];

    return {
      ...item,
      name: parseI18nString(item.name, lang),
      intro: parseI18nString(item.intro, lang),
      toolDescription: parseI18nString(item.toolDescription, lang),
      inputList: formattedInputList,
      inputListVal: dbPlugin?.inputListVal,
      pluginTags,
      tags,
      versionList: item.versionList
    };
  });
}

export default NextAPI(handler);
