import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import type { StartChatFnProps } from '@/components/ChatBox/type.d';
import { getToken } from '@/web/support/user/auth';
import { ModuleRunTimerOutputEnum } from '@fastgpt/global/core/module/constants';
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
  [ModuleRunTimerOutputEnum.responseData]: ChatHistoryItemResType[];
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
    let remainTextList: { event: `${sseResponseEventEnum}`; text: string }[] = [];
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
        remainTextList.forEach((item) => {
          onMessage(item);
          if (item.event === sseResponseEventEnum.answer) {
            responseText += item.text;
          }
        });
        return finish();
      }

      if (remainTextList.length > 0) {
        const fetchCount = Math.max(1, Math.round(remainTextList.length / 60));

        for (let i = 0; i < fetchCount; i++) {
          const item = remainTextList[i];
          onMessage(item);
          if (item.event === sseResponseEventEnum.answer) {
            responseText += item.text;
          }
        }

        remainTextList = remainTextList.slice(fetchCount);
      }

      if (finished && remainTextList.length === 0) {
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
              const errText = await res.clone().text();
              if (!errText.startsWith('event: error')) {
                failedFinish();
              }
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

            for (const item of text) {
              remainTextList.push({
                event,
                text: item
              });
            }
          } else if (event === sseResponseEventEnum.response) {
            const text: string = parseJson?.choices?.[0]?.delta?.content || '';
            remainTextList.push({
              event,
              text
            });
          } else if (
            event === sseResponseEventEnum.moduleStatus ||
            event === sseResponseEventEnum.toolCall ||
            event === sseResponseEventEnum.toolParams ||
            event === sseResponseEventEnum.toolResponse
          ) {
            onMessage({
              event,
              ...parseJson
            });
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
