import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { countPromptTokens } from '../../common/string/tiktoken/index';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { splitCombinePluginId } from '@fastgpt/global/core/app/plugin/utils';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { getSystemPluginByIdAndVersionId } from '../app/plugin/controller';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';

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

export async function getSystemToolRuntimeNodeById({
  pluginId,
  name,
  intro
}: {
  pluginId: string;
  name: string;
  intro: string;
}): Promise<RuntimeNodeItemType> {
  const { source } = splitCombinePluginId(pluginId);
  if (source === PluginSourceEnum.systemTool) {
    const tool = await getSystemPluginByIdAndVersionId(pluginId);
    return {
      ...tool,
      inputs: tool.inputs ?? [],
      outputs: tool.outputs ?? [],
      name,
      intro,
      flowNodeType: FlowNodeTypeEnum.tool,
      nodeId: getNanoid(),
      toolConfig: {
        systemTool: {
          toolId: pluginId
        }
      }
    };
  }
  return Promise.reject(PluginErrEnum.unExist);
}
