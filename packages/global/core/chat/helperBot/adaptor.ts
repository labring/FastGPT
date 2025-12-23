import { ChatCompletionRequestMessageRoleEnum } from '../../ai/constants';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam
} from '../../ai/type';
import { ChatFileTypeEnum, ChatRoleEnum } from '../constants';
import type { HelperBotChatItemType } from './type';
import { simpleUserContentPart } from '../adapt';

export const helperChats2GPTMessages = ({
  messages
}: {
  messages: HelperBotChatItemType[];
}): ChatCompletionMessageParam[] => {
  let results: ChatCompletionMessageParam[] = [];

  messages.forEach((item) => {
    if (item.obj === ChatRoleEnum.System) {
      const content = item.value?.[0]?.text?.content;
      if (content) {
        results.push({
          role: ChatCompletionRequestMessageRoleEnum.System,
          content
        });
      }
    } else if (item.obj === ChatRoleEnum.Human) {
      const value = item.value
        .map((item) => {
          if (item.text) {
            return {
              type: 'text',
              text: item.text?.content || ''
            };
          }
          if (item.file) {
            if (item.file?.type === ChatFileTypeEnum.image) {
              return {
                type: 'image_url',
                key: item.file.key,
                image_url: {
                  url: item.file.url
                }
              };
            } else if (item.file?.type === ChatFileTypeEnum.file) {
              return {
                type: 'file_url',
                name: item.file?.name || '',
                url: item.file.url,
                key: item.file.key
              };
            }
          }
        })
        .filter(Boolean) as ChatCompletionContentPart[];

      results.push({
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: simpleUserContentPart(value)
      });
    } else {
      const aiResults: ChatCompletionMessageParam[] = [];

      //AI: 只需要把根节点转化即可
      item.value.forEach((value, i) => {
        if ('collectionForm' in value) {
          const text = JSON.stringify(
            value.collectionForm.params.inputForm.map((item) => ({
              label: item.label,
              type: item.type
            }))
          );

          // Concat text
          const lastValue = item.value[i - 1];
          const lastResult = aiResults[aiResults.length - 1];
          if (lastValue && typeof lastResult?.content === 'string') {
            lastResult.content += text;
          } else {
            aiResults.push({
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              content: text
            });
          }
        } else if ('text' in value && typeof value.text?.content === 'string') {
          if (!value.text.content && item.value.length > 1) {
            return;
          }
          // Concat text
          const lastValue = item.value[i - 1];
          const lastResult = aiResults[aiResults.length - 1];
          if (lastValue && typeof lastResult?.content === 'string') {
            lastResult.content += value.text.content;
          } else {
            aiResults.push({
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              content: value.text.content
            });
          }
        }
      });

      // Auto add empty assistant message
      results = results.concat(
        aiResults.length > 0
          ? aiResults
          : [
              {
                role: ChatCompletionRequestMessageRoleEnum.Assistant,
                content: ''
              }
            ]
      );
    }
  });

  return results;
};
