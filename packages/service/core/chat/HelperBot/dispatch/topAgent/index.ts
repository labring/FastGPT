import type { HelperBotDispatchParamsType, HelperBotDispatchResponseType } from '../type';
import { helperChats2GPTMessages } from '@fastgpt/global/core/chat/helperBot/adaptor';

export const dispatchTopAgent = async (
  props: HelperBotDispatchParamsType
): Promise<HelperBotDispatchResponseType> => {
  const { query, files, metadata, histories } = props;
  const messages = helperChats2GPTMessages({
    messages: histories,
    reserveTool: false
  });
  // 拿工具资源参考 FastGPT/projects/app/src/pages/api/core/app/tool/getSystemToolTemplates.ts

  /* 
  流输出
    onReasoning({ text }) {
        if (!aiChatReasoning) return;
        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            reasoning_content: text
          })
        });
      },
      onStreaming({ text }) {
        if (!isResponseAnswerText) return;
        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text
          })
        });
      }
  */
};
