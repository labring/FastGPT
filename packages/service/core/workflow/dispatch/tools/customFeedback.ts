import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { addCustomFeedbacks } from '../../../chat/controller';
import { responseWrite } from '../../../../common/response';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.textareaInput]: string;
}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchCustomFeedback = (props: Record<string, any>): Response => {
  const {
    res,
    app: { _id: appId },
    chatId,
    responseChatItemId: chatItemId,
    stream,
    detail,
    params: { system_textareaInput: feedbackText = '' }
  } = props as Props;

  setTimeout(() => {
    addCustomFeedbacks({
      appId,
      chatId,
      chatItemId,
      feedbacks: [feedbackText]
    });
  }, 60000);

  if (stream) {
    if (!chatId || !chatItemId) {
      responseWrite({
        res,
        event: detail ? SseResponseEventEnum.fastAnswer : undefined,
        data: textAdaptGptResponse({
          text: `\n\n**自定义反馈成功: (仅调试模式下展示该内容)**: "${feedbackText}"\n\n`
        })
      });
    }
  }

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      textOutput: feedbackText
    }
  };
};
