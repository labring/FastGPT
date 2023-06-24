import { Props, ChatResponseType } from '@/pages/api/openapi/v1/chat/completions';
import { sseResponseEventEnum } from '@/constants/chat';
import { getErrText } from '@/utils/tools';
import { parseStreamChunk } from '@/utils/adapt';

interface StreamFetchProps {
  data: Props;
  onMessage: (text: string) => void;
  abortSignal: AbortController;
}
export const streamFetch = ({ data, onMessage, abortSignal }: StreamFetchProps) =>
  new Promise<ChatResponseType & { responseText: string; errMsg: string }>(
    async (resolve, reject) => {
      try {
        const response = await window.fetch('/api/openapi/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          signal: abortSignal.signal,
          body: JSON.stringify({
            ...data,
            stream: true
          })
        });

        if (response.status !== 200) {
          const err = await response.json();
          return reject(err);
        }

        if (!response?.body) {
          throw new Error('Request Error');
        }

        const reader = response.body?.getReader();

        // response data
        let responseText = '';
        let newChatId = '';
        let quoteLen = 0;
        let errMsg = '';

        const read = async () => {
          try {
            const { done, value } = await reader.read();
            if (done) {
              if (response.status === 200) {
                return resolve({
                  responseText,
                  newChatId,
                  quoteLen,
                  errMsg
                });
              } else {
                return reject('响应过程出现异常~');
              }
            }
            const chunkResponse = parseStreamChunk(value);

            chunkResponse.forEach((item) => {
              // parse json data
              const data = (() => {
                try {
                  return JSON.parse(item.data);
                } catch (error) {
                  return item.data;
                }
              })();

              if (item.event === sseResponseEventEnum.answer && data !== '[DONE]') {
                const answer: string = data?.choices?.[0].delta.content || '';
                onMessage(answer);
                responseText += answer;
              } else if (item.event === sseResponseEventEnum.chatResponse) {
                const chatResponse = data as ChatResponseType;
                newChatId = chatResponse.newChatId;
                quoteLen = chatResponse.quoteLen || 0;
              } else if (item.event === sseResponseEventEnum.error) {
                errMsg = getErrText(data, '流响应错误');
              }
            });
            read();
          } catch (err: any) {
            if (err?.message === 'The user aborted a request.') {
              return resolve({
                responseText,
                newChatId,
                quoteLen,
                errMsg
              });
            }
            reject(getErrText(err, '请求异常'));
          }
        };
        read();
      } catch (err: any) {
        console.log(err);

        reject(getErrText(err, '请求异常'));
      }
    }
  );
