import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  type GetPathProps,
  type ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';

export type pathQuery = GetPathProps;

export type pathBody = {};

export type pathResponse = Promise<ParentTreePathItemType[]>;

export async function handler(
  req: ApiRequestProps<pathBody, pathQuery>,
  res: ApiResponseType<any>
): Promise<pathResponse> {
  const { sourceId: pluginId, type = 'current' } = req.query;
  const lang = getLocale(req);

  if (!pluginId) return [];

  const parentToolId = getParentToolId(pluginId);
  const pathToolIds = type === 'parent' ? (parentToolId ? [parentToolId] : []) : [];

  if (type === 'current') {
    if (parentToolId) {
      pathToolIds.push(parentToolId);
    }
    pathToolIds.push(pluginId);
  }

  return Promise.all(pathToolIds.map((toolId) => getToolPathItem({ toolId, lang })));
}

export default NextAPI(handler);

function getParentToolId(toolId: string) {
  const { source, pluginId } = splitCombineToolId(toolId);

  if (![AppToolSourceEnum.systemTool, AppToolSourceEnum.commercial].includes(source)) {
    return;
  }

  const [parentPluginId, childPluginId] = pluginId.split('/');
  if (!parentPluginId || !childPluginId) return;

  return `${source}-${parentPluginId}`;
}

async function getToolPathItem({
  toolId,
  lang
}: {
  toolId: string;
  lang: ReturnType<typeof getLocale>;
}): Promise<ParentTreePathItemType> {
  const systemToolRepo = SystemToolRepo.getInstance();
  const { source } = splitCombineToolId(toolId);
  const tool = await systemToolRepo.getSystemToolDetail({
    pluginId: toolId,
    lang,
    source: source === AppToolSourceEnum.commercial ? AppToolSourceEnum.commercial : 'system'
  });

  return {
    parentId: toolId,
    parentName: tool.name
  };
}
