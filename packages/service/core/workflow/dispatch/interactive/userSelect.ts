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
import { updateUserSelectedResult } from '../../../chat/controller';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { responseWrite } from '../../../../common/response';
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
    res,
    detail,
    histories,
    stream,
    app: { _id: appId },
    chatId,
    node: { nodeId, isEntry },
    params: { description, userSelectOptions },
    query
  } = props;

  // Interactive node is not the entry node, return interactive result
  if (!isEntry) {
    const answerText = description ? `\n${description}` : undefined;
    if (res && stream && answerText) {
      responseWrite({
        res,
        event: detail ? SseResponseEventEnum.fastAnswer : undefined,
        data: textAdaptGptResponse({
          text: answerText
        })
      });
    }

    return {
      [NodeOutputKeyEnum.answerText]: answerText,
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'userSelect',
        params: {
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

  // Update db
  updateUserSelectedResult({
    appId,
    chatId,
    userSelectedVal
  });

  return {
    [DispatchNodeResponseKeyEnum.skipHandleId]: userSelectOptions
      .filter((item) => item.value !== userSelectedVal)
      .map((item: any) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      userSelectResult: userSelectedVal
    },
    [NodeOutputKeyEnum.selectResult]: userSelectedVal
  };
};
