import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import {
  encodeDebugToolId,
  isDebugToolSource,
  splitCombineToolId
} from '@fastgpt/global/core/app/tool/utils';
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
    const [parentPluginId, childPluginId] = toolId.split('/');
    if (!parentPluginId || !childPluginId) return;
    return parentPluginId;
  }

  const { source: parsedToolSource, pluginId } = splitCombineToolId(toolId);

  if (
    ![AppToolSourceEnum.systemTool, AppToolSourceEnum.commercial].includes(
      parsedToolSource as any
    ) &&
    !isDebugToolSource(parsedToolSource)
  ) {
    return;
  }

  const [parentPluginId, childPluginId] = pluginId.split('/');
  if (!parentPluginId || !childPluginId) return;

  return isDebugToolSource(parsedToolSource)
    ? encodeDebugToolId({ source: parsedToolSource, pluginId: parentPluginId })
    : `${parsedToolSource}-${parentPluginId}`;
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
  const parsedSource = source ? undefined : splitCombineToolId(toolId).source;
  const toolSource = source ?? parsedSource;
  const tool = await systemToolRepo.getSystemToolDisplayInfo({
    pluginId: toolId,
    lang,
    source:
      toolSource === AppToolSourceEnum.commercial || isDebugToolSource(toolSource)
        ? toolSource
        : 'system'
  });

  return {
    parentId: toolId,
    parentName: tool.name
  };
}
