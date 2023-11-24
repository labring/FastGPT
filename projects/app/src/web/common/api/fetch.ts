import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { parseStreamChunk, SSEParseData } from '@/utils/sse';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/api.d';
import { StartChatFnProps } from '@/components/ChatBox';
import { getToken } from '@/web/support/user/auth';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

type StreamFetchProps = {
  url?: string;
  data: Record<string, any>;
  onMessage: StartChatFnProps['generatingMessage'];
  abortSignal: AbortController;
};
type StreamResponseType = {
  responseText: string;
  [ModuleOutputKeyEnum.responseData]: ChatHistoryItemResType[];
};
export const streamFetch = ({
  url = '/api/v1/chat/completions',
  data,
  onMessage,
  abortSignal
}: StreamFetchProps) =>
  new Promise<StreamResponseType>(async (resolve, reject) => {
    try {
      const response = await window.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: getToken()
        },
        signal: abortSignal.signal,
        body: JSON.stringify({
          ...data,
          detail: true,
          stream: true
        })
      });

      if (!response?.body || !response?.ok) {
        throw new Error('Request Error');
      }

      const reader = response.body?.getReader();

      // response data
      let responseText = '';
      let errMsg = '';
      let responseData: ChatHistoryItemResType[] = [];

      const parseData = new SSEParseData();

      const read = async () => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            if (response.status === 200 && !errMsg) {
              return resolve({
                responseText,
                responseData
              });
            } else {
              return reject({
                message: errMsg || '响应过程出现异常~',
                responseText
              });
            }
          }
          const chunkResponse = parseStreamChunk(value);

          chunkResponse.forEach((item) => {
            // parse json data
            const { eventName, data } = parseData.parse(item);

            if (!eventName || !data) return;

            if (eventName === sseResponseEventEnum.answer && data !== '[DONE]') {
              const answer: string = data?.choices?.[0]?.delta?.content || '';
              onMessage({ text: answer });
              responseText += answer;
            } else if (
              eventName === sseResponseEventEnum.moduleStatus &&
              data?.name &&
              data?.status
            ) {
              onMessage(data);
            } else if (
              eventName === sseResponseEventEnum.appStreamResponse &&
              Array.isArray(data)
            ) {
              responseData = data;
            } else if (eventName === sseResponseEventEnum.error) {
              errMsg = getErrText(data, '流响应错误');
            }
          });
          read();
        } catch (err: any) {
          if (abortSignal.signal.aborted) {
            return resolve({
              responseText,
              responseData
            });
          }

          reject({
            responseText,
            message: getErrText(err, '请求异常')
          });
        }
      };
      read();
    } catch (err: any) {
      if (abortSignal.signal.aborted) {
        return resolve({
          responseText: '',
          responseData: []
        });
      }
      console.log(err, 'fetch error');

      reject(getErrText(err, '请求异常'));
    }
  });
