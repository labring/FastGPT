/* Only the token of gpt-3.5-turbo is used */
import { Tiktoken } from 'tiktoken/lite';
import cl100k_base from './cl100k_base.json';
import {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
  ChatCompletionCreateParams,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { parentPort } from 'worker_threads';

const enc = new Tiktoken(cl100k_base.bpe_ranks, cl100k_base.special_tokens, cl100k_base.pat_str);

/* count messages tokens */
parentPort?.on(
  'message',
  ({
    id,
    messages,
    tools,
    functionCall
  }: {
    id: string;
    messages: ChatCompletionMessageParam[];
    tools?: ChatCompletionTool[];
    functionCall?: ChatCompletionCreateParams.Function[];
  }) => {
    try {
      /* count one prompt tokens */
      const countPromptTokens = (
        prompt: string | ChatCompletionContentPart[] | null | undefined = '',
        role: '' | `${ChatCompletionRequestMessageRoleEnum}` = ''
      ) => {
        const promptText = (() => {
          if (!prompt) return '';
          if (typeof prompt === 'string') return prompt;
          let promptText = '';
          prompt.forEach((item) => {
            if (item.type === 'text') {
              promptText += item.text;
            } else if (item.type === 'image_url') {
              promptText += item.image_url.url;
            }
          });
          return promptText;
        })();

        const text = `${role}\n${promptText}`.trim();

        try {
          const encodeText = enc.encode(text);
          const supplementaryToken = role ? 4 : 0;
          return encodeText.length + supplementaryToken;
        } catch (error) {
          return text.length;
        }
      };
      const countToolsTokens = (
        tools?: ChatCompletionTool[] | ChatCompletionCreateParams.Function[]
      ) => {
        if (!tools || tools.length === 0) return 0;

        const toolText = tools
          ? JSON.stringify(tools)
              .replace('"', '')
              .replace('\n', '')
              .replace(/( ){2,}/g, ' ')
          : '';

        return enc.encode(toolText).length;
      };

      const total =
        messages.reduce((sum, item) => {
          // Evaluates the text of toolcall and functioncall
          const functionCallPrompt = (() => {
            let prompt = '';
            if (item.role === ChatCompletionRequestMessageRoleEnum.Assistant) {
              const toolCalls = item.tool_calls;
              prompt +=
                toolCalls
                  ?.map((item) => `${item?.function?.name} ${item?.function?.arguments}`.trim())
                  ?.join('') || '';

              const functionCall = item.function_call;
              prompt += `${functionCall?.name} ${functionCall?.arguments}`.trim();
            }
            return prompt;
          })();

          const contentPrompt = (() => {
            if (!item.content) return '';
            if (typeof item.content === 'string') return item.content;
            return item.content
              .map((item) => {
                if (item.type === 'text') return item.text;
                return '';
              })
              .join('');
          })();

          return sum + countPromptTokens(`${contentPrompt}${functionCallPrompt}`, item.role);
        }, 0) +
        countToolsTokens(tools) +
        countToolsTokens(functionCall);

      parentPort?.postMessage({
        id,
        type: 'success',
        data: total
      });
    } catch (error) {
      console.log(error);
      parentPort?.postMessage({
        id,
        type: 'success',
        data: 0
      });
    }
  }
);
