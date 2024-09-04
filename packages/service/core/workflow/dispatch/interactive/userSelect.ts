import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import type {
  UserSelectInteractive,
  UserSelectOptionItemType
} from '@fastgpt/global/core/workflow/template/system/userSelect/type';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.userSelectOptions]: UserSelectOptionItemType[];
}>;
type UserSelectResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]?: string;
  [DispatchNodeResponseKeyEnum.interactive]?: UserSelectInteractive;
  [NodeOutputKeyEnum.selectResult]?: string;
}>;

export const dispatchUserSelect = async (props: Props): Promise<UserSelectResponse> => {
  const {
    workflowStreamResponse,
    runningAppInfo: { id: appId },
    histories,
    chatId,
    node: { nodeId, isEntry },
    params: { description, userSelectOptions },
    query
  } = props;

  // Interactive node is not the entry node, return interactive result
  if (!isEntry) {
    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'userSelect',
        params: {
          description,
          userSelectOptions
        }
      }
    };
  }

  const { text: userSelectedVal } = chatValue2RuntimePrompt(query);

  // Error status
  if (userSelectedVal === undefined) {
    return {
      [DispatchNodeResponseKeyEnum.skipHandleId]: userSelectOptions.map((item) =>
        getHandleId(nodeId, 'source', item.value)
      )
    };
  }

  return {
    [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2), // Removes the current session record as the history of subsequent nodes
    [DispatchNodeResponseKeyEnum.skipHandleId]: userSelectOptions
      .filter((item) => item.value !== userSelectedVal)
      .map((item: any) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      userSelectResult: userSelectedVal
    },
    [NodeOutputKeyEnum.selectResult]: userSelectedVal
  };
};
