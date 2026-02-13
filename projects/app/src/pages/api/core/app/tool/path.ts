import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  type GetPathProps,
  type ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { getSystemTools } from '@fastgpt/service/core/app/tool/controller';

export type pathQuery = GetPathProps;

export type pathBody = {};

export type pathResponse = Promise<ParentTreePathItemType[]>;

async function handler(
  req: ApiRequestProps<pathBody, pathQuery>,
  res: ApiResponseType<any>
): Promise<pathResponse> {
  const { sourceId: pluginId, type } = req.query;
  const lang = getLocale(req);

  if (!pluginId) return [];

  const plugins = await getSystemTools();
  const plugin = plugins.find((item) => item.id === pluginId);

  if (!plugin) return [];

  return [
    {
      parentId: type === 'current' ? plugin.id : plugin.parentId,
      parentName: parseI18nString(plugin.name, lang)
    }
  ];
}

export default NextAPI(handler);
