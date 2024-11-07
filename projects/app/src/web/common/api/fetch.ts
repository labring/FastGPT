import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  // refer to https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web
  EventStreamContentType,
  fetchEventSource
} from '@fortaine/fetch-event-source';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useSystemStore } from '../system/useSystemStore';
import { formatTime2YMDHMW } from '@fastgpt/global/common/string/time';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

type StreamFetchProps = {
  url?: string;
  data: Record<string, any>;
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
};
export type StreamResponseType = {
  responseText: string;
  [DispatchNodeResponseKeyEnum.nodeResponse]: ChatHistoryItemResType[];
};
type ResponseQueueItemType =
  | { event: SseResponseEventEnum.fastAnswer | SseResponseEventEnum.answer; text: string }
  | { event: SseResponseEventEnum.interactive; [key: string]: any }
  | {
      event:
        | SseResponseEventEnum.toolCall
        | SseResponseEventEnum.toolParams
        | SseResponseEventEnum.toolResponse;
      [key: string]: any;
    };
class FatalError extends Error {}

export const streamFetch = ({
  url = '/api/v1/chat/completions',
  data,
  onMessage,
  abortCtrl
}: StreamFetchProps) =>
  new Promise<StreamResponseType>(async (resolve, reject) => {
    // First res
    const timeoutId = setTimeout(() => {
      abortCtrl.abort('Time out');
    }, 60000);

    // response data
    let responseText = '';
    let responseQueue: ResponseQueueItemType[] = [];
    let errMsg: string | undefined;
    let responseData: ChatHistoryItemResType[] = [];
    let finished = false;

    const finish = () => {
      if (errMsg !== undefined) {
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
        message: getErrText(err, errMsg ?? '响应过程出现异常~'),
        responseText
      });
    };

    const isAnswerEvent = (event: SseResponseEventEnum) =>
      event === SseResponseEventEnum.answer || event === SseResponseEventEnum.fastAnswer;
    // animate response to make it looks smooth
    function animateResponseText() {
      // abort message
      if (abortCtrl.signal.aborted) {
        responseQueue.forEach((item) => {
          onMessage(item);
          if (isAnswerEvent(item.event)) {
            responseText += item.text;
          }
        });
        return finish();
      }

      if (responseQueue.length > 0) {
        const fetchCount = Math.max(1, Math.round(responseQueue.length / 30));
        for (let i = 0; i < fetchCount; i++) {
          const item = responseQueue[i];
          onMessage(item);
          if (isAnswerEvent(item.event)) {
            responseText += item.text;
          }
        }

        responseQueue = responseQueue.slice(fetchCount);
      }

      if (finished && responseQueue.length === 0) {
        return finish();
      }

      requestAnimationFrame(animateResponseText);
    }
    // start animation
    animateResponseText();

    const pushDataToQueue = (data: ResponseQueueItemType) => {
      // If the document is hidden, the data is directly sent to the front end
      responseQueue.push(data);

      if (document.hidden) {
        animateResponseText();
      }
    };

    try {
      // auto complete variables
      const variables = data?.variables || {};
      variables.cTime = formatTime2YMDHMW();

      const requestData = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
      await fetchEventSource(getWebReqUrl(url), {
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
          // console.log(parseJson, event);
          if (event === SseResponseEventEnum.answer) {
            const text = parseJson.choices?.[0]?.delta?.content || '';
            for (const item of text) {
              pushDataToQueue({
                event,
                text: item
              });
            }
          } else if (event === SseResponseEventEnum.fastAnswer) {
            const text = parseJson.choices?.[0]?.delta?.content || '';
            pushDataToQueue({
              event,
              text
            });
          } else if (
            event === SseResponseEventEnum.toolCall ||
            event === SseResponseEventEnum.toolParams ||
            event === SseResponseEventEnum.toolResponse
          ) {
            pushDataToQueue({
              event,
              ...parseJson
            });
          } else if (event === SseResponseEventEnum.flowNodeStatus) {
            onMessage({
              event,
              ...parseJson
            });
          } else if (event === SseResponseEventEnum.flowResponses && Array.isArray(parseJson)) {
            responseData = parseJson;
          } else if (event === SseResponseEventEnum.updateVariables) {
            onMessage({
              event,
              variables: parseJson
            });
          } else if (event === SseResponseEventEnum.interactive) {
            pushDataToQueue({
              event,
              ...parseJson
            });
          } else if (event === SseResponseEventEnum.error) {
            if (parseJson.statusText === TeamErrEnum.aiPointsNotEnough) {
              useSystemStore.getState().setIsNotSufficientModal(true);
            }
            errMsg = getErrText(parseJson, '流响应错误');
          }
        },
        onclose() {
          finished = true;
        },
        onerror(err) {
          if (err instanceof FatalError) {
            throw err;
          }
          clearTimeout(timeoutId);
          failedFinish(getErrText(err));
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
