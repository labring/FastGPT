import { sseResponseEventEnum } from '@/constants/chat';
import { getErrText } from '@/utils/tools';
import { parseStreamChunk } from '@/utils/adapt';
import { NextApiResponse } from 'next';
import { sseResponse } from '../utils/tools';

interface Props {
  res: NextApiResponse; // 用于流转发
  url: string;
  data: Record<string, any>;
}
export const moduleFetch = ({ url, data, res }: Props) =>
  new Promise<Record<string, any>>(async (resolve, reject) => {
    try {
      const baseUrl = `http://localhost:3000/api`;
      const requestUrl = url.startsWith('/') ? `${baseUrl}${url}` : url;
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response?.body) {
        throw new Error('Request Error');
      }

      const responseType = response.headers.get('content-type');
      if (responseType && responseType.includes('application/json')) {
        const jsonResponse = await response.json();
        return resolve(jsonResponse?.data || {});
      }

      const reader = response.body?.getReader();

      let chatResponse = {};

      const read = async () => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            return resolve(chatResponse);
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
            if (item.event === sseResponseEventEnum.moduleFetchResponse) {
              chatResponse = {
                ...chatResponse,
                ...data
              };
            } else if (item.event === sseResponseEventEnum.answer && data?.choices?.[0]?.delta) {
              sseResponse({
                res,
                event: sseResponseEventEnum.answer,
                data: JSON.stringify(data)
              });
            }
          });
          read();
        } catch (err: any) {
          reject(getErrText(err, '请求异常'));
        }
      };
      read();
    } catch (err: any) {
      console.log(err);
      reject(getErrText(err, '请求异常'));
    }
  });
