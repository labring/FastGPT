import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { countPromptTokens } from '../../common/string/tiktoken/index';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  getPluginInputsFromStoreNodes,
  getPluginRunContent
} from '@fastgpt/global/core/app/plugin/utils';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { UserChatItemType } from '@fastgpt/global/core/chat/type';

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

/* Get plugin runtime input user query */
export const getPluginRunUserQuery = (
  nodes: StoreNodeItemType[],
  variables: Record<string, any>
): UserChatItemType & { dataId: string } => {
  return {
    dataId: getNanoid(24),
    obj: ChatRoleEnum.Human,
    value: [
      {
        type: ChatItemValueTypeEnum.text,
        text: {
          content: getPluginRunContent({
            pluginInputs: getPluginInputsFromStoreNodes(nodes),
            variables
          })
        }
      }
    ]
  };
};
