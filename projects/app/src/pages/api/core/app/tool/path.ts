import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import {
  GetToolPathQuerySchema,
  GetToolPathResponseSchema,
  type GetToolPathQueryType,
  type GetToolPathResponseType
} from '@fastgpt/global/openapi/core/app/tool/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type pathQuery = GetToolPathQueryType;

export type pathBody = Record<string, never>;

export type pathResponse = Promise<GetToolPathResponseType>;

export async function handler(req: ApiRequestProps<pathBody, pathQuery>): Promise<pathResponse> {
  const {
    query: { sourceId: pluginId, type = 'current' }
  } = parseApiInput({
    req,
    querySchema: GetToolPathQuerySchema
  });
  const lang = getLocale(req);

  if (!pluginId) return GetToolPathResponseSchema.parse([]);

  const parentToolId = getParentToolId(pluginId);
  const pathToolIds = type === 'parent' ? (parentToolId ? [parentToolId] : []) : [];

  if (type === 'current') {
    if (parentToolId) {
      pathToolIds.push(parentToolId);
    }
    pathToolIds.push(pluginId);
  }

  return GetToolPathResponseSchema.parse(
    await Promise.all(pathToolIds.map((toolId) => getToolPathItem({ toolId, lang })))
  );
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
}): Promise<GetToolPathResponseType[number]> {
  const systemToolRepo = SystemToolRepo.getInstance();
  const { source } = splitCombineToolId(toolId);
  const tool = await systemToolRepo.getSystemToolDisplayInfo({
    pluginId: toolId,
    lang,
    source: source === AppToolSourceEnum.commercial ? AppToolSourceEnum.commercial : 'system'
  });

  return {
    parentId: toolId,
    parentName: tool.name
  };
}
