import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { StartChatFnProps } from '@/components/ChatBox';
import { getToken } from '@/web/support/user/auth';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import dayjs from 'dayjs';
import {
  // refer to https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web
  EventStreamContentType,
  fetchEventSource
} from '@fortaine/fetch-event-source';

type StreamFetchProps = {
  url?: string;
  data: Record<string, any>;
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
};
type StreamResponseType = {
  responseText: string;
  [ModuleOutputKeyEnum.responseData]: ChatHistoryItemResType[];
};
export const streamFetch = ({
  url = '/api/v1/chat/completions',
  data,
  onMessage,
  abortCtrl
}: StreamFetchProps) =>
  new Promise<StreamResponseType>(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      abortCtrl.abort('Time out');
    }, 60000);

    // response data
    let responseText = '';
    let remainText = '';
    let errMsg = '';
    let responseData: ChatHistoryItemResType[] = [];
    let finished = false;

    const finish = () => {
      if (errMsg) {
        return failedFinish();
      }
      return resolve({
        responseText,
        responseData
      });
    };
    const failedFinish = (err?: any) => {
      finished = true;
      reject({
        message: getErrText(err, errMsg || '响应过程出现异常~'),
        responseText
      });
    };

    // animate response to make it looks smooth
    function animateResponseText() {
      // abort message
      if (abortCtrl.signal.aborted) {
        onMessage({ text: remainText });
        responseText += remainText;
        return finish();
      }

      if (remainText) {
        const fetchCount = Math.max(1, Math.round(remainText.length / 60));
        const fetchText = remainText.slice(0, fetchCount);

        onMessage({ text: fetchText });

        responseText += fetchText;
        remainText = remainText.slice(fetchCount);
      }

      if (finished && !remainText) {
        return finish();
      }

      requestAnimationFrame(animateResponseText);
    }
    // start animation
    animateResponseText();

    try {
      // auto complete variables
      const variables = data?.variables || {};
      variables.cTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

      const requestData = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: getToken()
        },
        signal: abortCtrl.signal,
        body: JSON.stringify({
          ...data,
          variables,
          detail: true,
          stream: true
        })
      };

      // send request
      await fetchEventSource(url, {
        ...requestData,
        async onopen(res) {
          clearTimeout(timeoutId);
          const contentType = res.headers.get('content-type');

          // not stream
          if (contentType?.startsWith('text/plain')) {
            return failedFinish(await res.clone().text());
          }

          // failed stream
          if (
            !res.ok ||
            !res.headers.get('content-type')?.startsWith(EventStreamContentType) ||
            res.status !== 200
          ) {
            try {
              failedFinish(await res.clone().json());
            } catch {
              failedFinish(await res.clone().text());
            }
          }
        },
        onmessage({ event, data }) {
          if (data === '[DONE]') {
            return;
          }

          // parse text to json
          const parseJson = (() => {
            try {
              return JSON.parse(data);
            } catch (error) {
              return {};
            }
          })();

          if (event === sseResponseEventEnum.answer) {
            const text: string = parseJson?.choices?.[0]?.delta?.content || '';
            remainText += text;
          } else if (event === sseResponseEventEnum.response) {
            const text: string = parseJson?.choices?.[0]?.delta?.content || '';
            onMessage({ text });
            responseText += text;
          } else if (
            event === sseResponseEventEnum.moduleStatus &&
            parseJson?.name &&
            parseJson?.status
          ) {
            onMessage(parseJson);
          } else if (event === sseResponseEventEnum.appStreamResponse && Array.isArray(parseJson)) {
            responseData = parseJson;
          } else if (event === sseResponseEventEnum.error) {
            errMsg = getErrText(parseJson, '流响应错误');
          }
        },
        onclose() {
          finished = true;
        },
        onerror(e) {
          clearTimeout(timeoutId);
          failedFinish(getErrText(e));
        },
        openWhenHidden: true
      });
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (abortCtrl.signal.aborted) {
        finished = true;

        return;
      }
      console.log(err, 'fetch error');

      failedFinish(err);
    }
  });
