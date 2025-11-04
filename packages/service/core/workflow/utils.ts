import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { countPromptTokens } from '../../common/string/tiktoken/index';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { getSystemToolByIdAndVersionId, getSystemTools } from '../app/tool/controller';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';

/* filter search result */
export const filterSearchResultsByMaxChars = async (
  list: SearchDataResponseItemType[],
  maxTokens: number
) => {
  const results: SearchDataResponseItemType[] = [];
  let totalTokens = 0;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    totalTokens += await countPromptTokens(item.q + item.a);
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

export async function getSystemToolRunTimeNodeFromSystemToolset({
  toolSetNode,
  lang = 'en'
}: {
  toolSetNode: RuntimeNodeItemType;
  lang?: localeType;
}): Promise<RuntimeNodeItemType[]> {
  const systemToolId = toolSetNode.toolConfig?.systemToolSet?.toolId!;

  const toolsetInputConfig = toolSetNode.inputs.find(
    (item) => item.key === NodeInputKeyEnum.systemInputConfig
  );
  const tools = await getSystemTools();
  const children = tools.filter(
    (item) => item.parentId === systemToolId && (item.status === 1 || item.status === undefined)
  );
  const nodes = await Promise.all(
    children.map(async (child, index) => {
      const toolListItem = toolSetNode.toolConfig?.systemToolSet?.toolList.find(
        (item) => item.toolId === child.id
      );

      const tool = await getSystemToolByIdAndVersionId(child.id);

      const inputs = tool.inputs ?? [];
      if (toolsetInputConfig?.value) {
        const configInput = inputs.find((item) => item.key === NodeInputKeyEnum.systemInputConfig);
        if (configInput) {
          configInput.value = toolsetInputConfig.value;
        }
      }

      return {
        ...tool,
        inputs,
        outputs: tool.outputs ?? [],
        name: toolListItem?.name || parseI18nString(tool.name, lang),
        intro: toolListItem?.description || parseI18nString(tool.intro, lang),
        flowNodeType: FlowNodeTypeEnum.tool,
        nodeId: `${toolSetNode.nodeId}${index}`,
        toolConfig: {
          systemTool: {
            toolId: child.id
          }
        }
      };
    })
  );

  return nodes;
}
