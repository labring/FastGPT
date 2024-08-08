import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DispatchNodeResultType,
  ModuleDispatchProps,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import { responseWrite } from '../../../../common/response';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { UserSelectOptionType } from '@fastgpt/global/core/workflow/template/system/userSelect/type';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AIChatItemValueItemType, NodeOutputItemType } from '@fastgpt/global/core/chat/type';
import { updateUserSelectedIndex } from '../../../chat/controller';
import { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.userSelectOptions]: UserSelectOptionType[];
}>;
type UserSelectResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.selectResult]?: string;
}>;

const defaultParseJson = {
  nodeId: undefined,
  params: { userSeletedIndex: null, description: '', userSelectOptions: [], nodeOutputs: [] }
};

export const dispatchUserSelect = async (props: Props): Promise<UserSelectResponse> => {
  const {
    res,
    query,
    histories,
    app: { _id: appId },
    chatId,
    node: { nodeId },
    params: { description, userSelectOptions },
    runtimeNodes
  } = props as Props;
  const parsedJson = (() => {
    try {
      const lastAIHistory = histories[histories.length - 1];
      const lastAIMessage = lastAIHistory?.value as AIChatItemValueItemType[];
      const interactiveContent = lastAIMessage.find(
        (item) => item.type === ChatItemValueTypeEnum.interactive
      )?.interactive;
      if (!interactiveContent) return defaultParseJson;
      const selectedIndex = interactiveContent.params.userSelectOptions?.findIndex(
        (item) => item.value === query[0].text?.content
      );
      if (selectedIndex !== undefined && selectedIndex >= 0) {
        updateUserSelectedIndex({
          appId,
          chatId,
          dataId: lastAIHistory.dataId,
          userSeletedIndex: selectedIndex
        });
        return {
          ...interactiveContent,
          params: {
            ...interactiveContent.params,
            userSeletedIndex: selectedIndex
          }
        };
      }

      return interactiveContent;
    } catch (error) {
      return defaultParseJson;
    }
  })();

  const nodeOutputs = getNodeOutputs(runtimeNodes).concat(parsedJson.params.nodeOutputs || []);

  if (parsedJson.nodeId !== nodeId) {
    responseWrite({
      res,
      event: SseResponseEventEnum.userSelect,
      data: JSON.stringify({
        interactive: {
          nodeId,
          params: {
            description,
            userSelectOptions,
            userSeletedIndex: null,
            nodeOutputs
          }
        }
      })
    });

    return {
      [DispatchNodeResponseKeyEnum.endHandleId]: userSelectOptions.map((item: any) =>
        getHandleId(nodeId, 'source', item.key)
      ),
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        description: description,
        userSelectOptions: userSelectOptions,
        userSeletedIndex: null,
        currentNodeId: nodeId,
        nodeOutputs
      }
    };
  }

  return {
    [DispatchNodeResponseKeyEnum.skipHandleId]: userSelectOptions
      .filter((item: any, index: number) => index !== parsedJson.params.userSeletedIndex)
      .map((item: any) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      description: parsedJson.params.description,
      userSelectOptions: parsedJson.params.userSelectOptions,
      userSeletedIndex: parsedJson.params.userSeletedIndex,
      currentNodeId: undefined,
      nodeOutputs
    },
    [NodeOutputKeyEnum.selectResult]:
      parsedJson.params.userSeletedIndex === null ||
      parsedJson.params.userSeletedIndex === undefined
        ? undefined
        : userSelectOptions[parsedJson.params.userSeletedIndex].value
  };
};

function getNodeOutputs(runtimeNodes: RuntimeNodeItemType[]) {
  const nodeOutputs: NodeOutputItemType[] = [];

  runtimeNodes.forEach((node) => {
    if (node.outputs && node.outputs.length > 0) {
      node.outputs.forEach((output: FlowNodeOutputItemType) => {
        if (output.value !== undefined) {
          nodeOutputs.push({
            nodeId: node.nodeId,
            key: output.key as NodeOutputKeyEnum,
            value: output.value
          });
        }
      });
    }
  });

  return nodeOutputs;
}
