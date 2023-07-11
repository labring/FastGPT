import { sseResponseEventEnum } from '@/constants/chat';
import { getErrText } from '@/utils/tools';
import { parseStreamChunk } from '@/utils/adapt';

interface StreamFetchProps {
  url?: string;
  data: Record<string, any>;
  onMessage: (text: string) => void;
  abortSignal: AbortController;
}
export const streamFetch = ({
  url = '/api/openapi/v1/chat/completions',
  data,
  onMessage,
  abortSignal
}: StreamFetchProps) =>
  new Promise<{ responseText: string; errMsg: string; newHistoryId: string | null }>(
    async (resolve, reject) => {
      try {
        const response = await window.fetch(url, {
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
        let errMsg = '';
        const newHistoryId = response.headers.get('newHistoryId');

        const read = async () => {
          try {
            const { done, value } = await reader.read();
            if (done) {
              if (response.status === 200) {
                return resolve({
                  responseText,
                  errMsg,
                  newHistoryId
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
              } else if (item.event === sseResponseEventEnum.error) {
                errMsg = getErrText(data, '流响应错误');
              }
            });
            read();
          } catch (err: any) {
            if (err?.message === 'The user aborted a request.') {
              return resolve({
                responseText,
                errMsg,
                newHistoryId
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
