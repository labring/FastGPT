import { sseResponseEventEnum } from '@/constants/chat';
import { getErrText } from '@/utils/tools';
import { parseStreamChunk } from '@/utils/adapt';
import { NextApiResponse } from 'next';
import { sseResponse } from '../utils/tools';
import { SpecificInputEnum } from '@/constants/app';

interface Props {
  res: NextApiResponse; // 用于流转发
  url: string;
  data: Record<string, any>;
}
export const moduleFetch = ({ url, data, res }: Props) =>
  new Promise<Record<string, any>>(async (resolve, reject) => {
    try {
      const abortSignal = new AbortController();
      const baseUrl = `http://localhost:${process.env.PORT || 3000}/api`;
      const requestUrl = url.startsWith('/') ? `${baseUrl}${url}` : url;
      const response = await fetch(requestUrl, {
        method: 'POST',
        // @ts-ignore
        headers: {
          'Content-Type': 'application/json',
          rootkey: process.env.ROOT_KEY
        },
        body: JSON.stringify(data),
        signal: abortSignal.signal
      });

      if (response.status >= 300 || response.status < 200) {
        const err = await response.json();
        return reject(err);
      }

      if (!response?.body) {
        throw new Error('Request Error');
      }

      const responseType = response.headers.get('content-type');
      if (responseType && responseType.includes('application/json')) {
        const jsonResponse = await response.json();
        return resolve(jsonResponse?.data || {});
      }

      const reader = response.body?.getReader();

      let chatResponse: Record<string, any> = {
        [SpecificInputEnum.answerText]: ''
      };

      const read = async () => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            return resolve(chatResponse);
          } else if (res.closed) {
            resolve(chatResponse);
            abortSignal.abort();
            return;
          }

          const chunkResponse = parseStreamChunk(value);

          chunkResponse.forEach((item) => {
            // parse json data
            const data = (() => {
              try {
                return JSON.parse(item.data);
              } catch (error) {
                return {};
              }
            })();
            if (!res.closed && item.event === sseResponseEventEnum.moduleFetchResponse) {
              chatResponse = {
                ...chatResponse,
                ...data
              };
            } else if (
              !res.closed &&
              item.event === sseResponseEventEnum.answer &&
              data?.choices?.[0]?.delta
            ) {
              // save answer
              const answer: string = data?.choices?.[0].delta.content || '';
              if (answer) {
                chatResponse = {
                  ...chatResponse,
                  [SpecificInputEnum.answerText]:
                    chatResponse[SpecificInputEnum.answerText] + answer
                };
              }

              sseResponse({
                res,
                event: sseResponseEventEnum.answer,
                data: JSON.stringify(data)
              });
            } else if (item.event === sseResponseEventEnum.error) {
              return reject(getErrText(data, '流响应错误'));
            }
          });
          read();
        } catch (err: any) {
          if (err?.message === 'The operation was aborted.') {
            return;
          }
          reject(getErrText(err, '请求异常'));
        }
      };
      read();
    } catch (err: any) {
      console.log(err);
      reject(getErrText(err, '请求异常'));
    }
  });
