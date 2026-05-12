import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { countPromptTokensBatch } from '../../../common/string/tiktoken/index';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
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
  const nodes = tool.children?.map((child) => {
    return {
      flowNodeType: FlowNodeTypeEnum.tool,
      inputs: toolsetInputConfig ? [toolsetInputConfig, ...(tool.inputs ?? [])] : tool.inputs ?? [],
      outputs: tool.outputs ?? [],
      name: child.name,
      nodeId: `${toolSetNode.nodeId}${child.id}`,
      version: runtimeVersion,
      toolDescription: child.toolDescription,
      toolConfig: {
        systemTool: {
          toolId: child.id
        }
      },
      pluginId: `${systemToolId}/${child.id}`
      // BUG: 不知道 catchError 从哪里拿，后续需要优化实现
      // catchError: toolSetNode.
    } satisfies RuntimeNodeItemType;
  });

  return nodes;
}
