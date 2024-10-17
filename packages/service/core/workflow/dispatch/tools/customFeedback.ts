import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { addCustomFeedbacks } from '../../../chat/controller';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.textareaInput]: string;
}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchCustomFeedback = (props: Record<string, any>): Response => {
  const {
    runningAppInfo: { id: appId },
    chatId,
    responseChatItemId: dataId,
    stream,
    workflowStreamResponse,
    params: { system_textareaInput: feedbackText = '' }
  } = props as Props;

  setTimeout(() => {
    addCustomFeedbacks({
      appId,
      chatId,
      dataId,
      feedbacks: [feedbackText]
    });
  }, 60000);

  if (stream) {
    if (!chatId || !dataId) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.fastAnswer,
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
