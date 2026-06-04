import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { countPromptTokensBatch } from '../../../common/string/tiktoken/index';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { SystemToolRepo } from '../../app/tool/systemTool/systemTool.repo';

/* filter search result */
export const filterSearchResultsByMaxChars = async (
  list: SearchDataResponseItemType[],
  maxTokens: number
) => {
  const results: SearchDataResponseItemType[] = [];
  let totalTokens = 0;
  const itemTokens = await countPromptTokensBatch(list.map((item) => item.q + item.a));

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    totalTokens += itemTokens[i] || 0;
    if (totalTokens > maxTokens + 500) {
      break;
    }
    results.push(item);
    if (totalTokens > maxTokens) {
      break;
    }
  }

  return results.length === 0 ? list.slice(0, 1) : results;
};

/**
 * 把 SystemTool Toolset 替换为 Tool 节点
 */
export async function getSystemToolRunTimeNodeFromSystemToolset({
  toolSetNode,
  lang = 'en'
}: {
  toolSetNode: Pick<RuntimeNodeItemType, 'toolConfig' | 'inputs' | 'nodeId' | 'version'>;
  lang?: localeType;
}): Promise<RuntimeNodeItemType[]> {
  const systemToolId = toolSetNode.toolConfig?.systemToolSet?.toolId!;
  const selectedTools = toolSetNode.toolConfig?.systemToolSet?.toolList ?? [];
  if (!selectedTools.length) return [];

  const toolsetInputConfig = toolSetNode.inputs.find(
    (item) => item.key === NodeInputKeyEnum.systemInputConfig
  );
  const systemToolRepo = SystemToolRepo.getInstance();
  const tool = await systemToolRepo.getSystemToolDetail({
    pluginId: systemToolId,
    lang,
    // source: toolSetNode.toolConfig?.systemToolSet?.source,
    source: 'system',
    version: toolSetNode.version,
    fallbackLatestVersion: true
  });

  if (!tool.children) return [];

  const runtimeVersion = tool.version || toolSetNode.version;
  const childMap = new Map<string, (typeof tool.children)[number]>(
    tool.children.map((child) => [`${systemToolId}/${child.id}`, child])
  );
  tool.children.forEach((child) => {
    childMap.set(child.id, child);
  });

  const nodes = selectedTools.flatMap((selectedTool) => {
    const child = childMap.get(selectedTool.toolId);
    if (!child) return [];

    const pluginId = `${systemToolId}/${child.id}`;
    const intro = selectedTool.description || child.description;
    const toolDescription = selectedTool.description || child.toolDescription || child.description;

    return {
      flowNodeType: FlowNodeTypeEnum.tool,
      avatar: tool.avatar,
      inputs: toolsetInputConfig
        ? [toolsetInputConfig, ...(child.inputs ?? [])]
        : (child.inputs ?? []),
      outputs: child.outputs ?? [],
      name: selectedTool.name || child.name,
      intro,
      nodeId: `${toolSetNode.nodeId}${child.id}`,
      version: runtimeVersion,
      toolDescription,
      toolConfig: {
        systemTool: {
          toolId: pluginId
        }
      },
      pluginId
      // BUG: 不知道 catchError 从哪里拿，后续需要优化实现
      // catchError: toolSetNode.
    } satisfies RuntimeNodeItemType;
  });

  return nodes;
}
