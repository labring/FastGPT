import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import { isDebugToolSource, splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
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
    query: { sourceId: pluginId, source, type = 'current' }
  } = parseApiInput({
    req,
    querySchema: GetToolPathQuerySchema
  });
  const lang = getLocale(req);

  if (!pluginId) return GetToolPathResponseSchema.parse([]);

  const parentToolId = getParentToolId({ toolId: pluginId, source });
  const pathToolIds = type === 'parent' ? (parentToolId ? [parentToolId] : []) : [];

  if (type === 'current') {
    if (parentToolId) {
      pathToolIds.push(parentToolId);
    }
    pathToolIds.push(pluginId);
  }

  return GetToolPathResponseSchema.parse(
    await Promise.all(pathToolIds.map((toolId) => getToolPathItem({ toolId, source, lang })))
  );
}

export default NextAPI(handler);

function getParentToolId({ toolId, source }: { toolId: string; source?: string }) {
  if (isDebugToolSource(source)) {
    const { pluginId, hasIdPrefix, idSource } = parseToolIdForPath(toolId);
    const [parentPluginId, childPluginId] = pluginId.split('/');
    if (!parentPluginId || !childPluginId) return;
    return hasIdPrefix ? `${idSource}-${parentPluginId}` : parentPluginId;
  }

  const { source: idSource, pluginId } = splitCombineToolId(toolId);

  if (![AppToolSourceEnum.systemTool, AppToolSourceEnum.commercial].includes(idSource as any)) {
    return;
  }

  const [parentPluginId, childPluginId] = pluginId.split('/');
  if (!parentPluginId || !childPluginId) return;

  return `${idSource}-${parentPluginId}`;
}

async function getToolPathItem({
  toolId,
  source,
  lang
}: {
  toolId: string;
  source?: string;
  lang: ReturnType<typeof getLocale>;
}): Promise<GetToolPathResponseType[number]> {
  const systemToolRepo = SystemToolRepo.getInstance();
  const idSource = isDebugToolSource(source)
    ? parseToolIdForPath(toolId).idSource
    : splitCombineToolId(toolId).source;
  const toolSource = isDebugToolSource(source)
    ? source
    : idSource === AppToolSourceEnum.commercial
      ? AppToolSourceEnum.commercial
      : 'system';
  const tool = await systemToolRepo.getSystemToolDisplayInfo({
    pluginId: toolId,
    lang,
    source: toolSource
  });

  return {
    parentId: toolId,
    parentName: tool.name
  };
}

function parseToolIdForPath(toolId: string) {
  try {
    const parsed = splitCombineToolId(toolId);
    return {
      idSource: parsed.source,
      pluginId: parsed.pluginId,
      hasIdPrefix: [AppToolSourceEnum.systemTool, AppToolSourceEnum.commercial].includes(
        parsed.source as AppToolSourceEnum
      )
    };
  } catch {
    return {
      idSource: undefined,
      pluginId: toolId,
      hasIdPrefix: false
    };
  }
}
