import {
  SseResponseEventEnum,
  StreamResumeCompletedEvent,
  StreamResumePhaseEnum,
  StreamResumePhaseEvent
} from '@fastgpt/global/core/workflow/runtime/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import {
  // refer to https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web
  EventStreamContentType,
  fetchEventSource
} from '@fortaine/fetch-event-source';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useSystemStore } from '../system/useSystemStore';
import { formatTime2YMDHMW } from '@fastgpt/global/common/string/time';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import type { OnOptimizePromptProps } from '@/components/common/PromptEditor/OptimizerPopover';
import type { OnOptimizeCodeProps } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode/Copilot';
import type {
  StepTitleItemType,
  ToolModuleResponseItemType,
  SkillModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import type { TopAgentFormDataType } from '@fastgpt/service/core/chat/HelperBot/dispatch/topAgent/type';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type {
  ResumeStreamParams,
  StreamNoNeedToBeResumeType
} from '@fastgpt/global/openapi/core/ai/api';

type StreamFetchProps = {
  url?: string;
  data: Record<string, any>;
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
};
export type StreamResponseType = {
  responseText: string;
};
export type ResumeStreamResponseType = StreamResponseType & {
  completedChat?: StreamNoNeedToBeResumeType;
};

type CommonResponseType = {
  responseValueId?: string;
  stepId?: string;
};
type ResponseQueueItemType = CommonResponseType &
  (
    | {
        event: SseResponseEventEnum.fastAnswer | SseResponseEventEnum.answer;
        text?: string;
        reasoningText?: string;
      }
    | {
        event: SseResponseEventEnum.interactive;
        [key: string]: any;
      }
    | {
        event:
          | SseResponseEventEnum.toolCall
          | SseResponseEventEnum.toolParams
          | SseResponseEventEnum.toolResponse;
        tool: ToolModuleResponseItemType;
      }
    | {
        event: SseResponseEventEnum.collectionForm;
        collectionForm: UserInputInteractive;
      }
    | {
        event: SseResponseEventEnum.topAgentConfig;
        data: TopAgentFormDataType;
      }
    | {
        event: SseResponseEventEnum.plan;
        plan: AgentPlanType;
      }
    | {
        event: SseResponseEventEnum.stepTitle;
        stepTitle: StepTitleItemType;
      }
    | {
        event: SseResponseEventEnum.skillCall;
        skill: SkillModuleResponseItemType;
      }
  );

class FatalError extends Error {}

const handleStreamMessage = ({
  event,
  data,
  onMessage,
  pushDataToQueue,
  setErrMsg,
  splitAnswerTextByCharacter = true
}: {
  event: string;
  data: string;
  onMessage: StartChatFnProps['generatingMessage'];
  pushDataToQueue: (data: ResponseQueueItemType) => void;
  setErrMsg: (err: string) => void;
  splitAnswerTextByCharacter?: boolean;
}) => {
  if (data === '[DONE]') {
    return;
  }

  const parseJson = (() => {
    try {
      return JSON.parse(data);
    } catch (error) {
      return;
    }
  })();

  if (typeof parseJson !== 'object') return;
  const { responseValueId, stepId, ...rest } = parseJson;

  if (event === SseResponseEventEnum.answer) {
    const reasoningText = rest.choices?.[0]?.delta?.reasoning_content || '';
    pushDataToQueue({
      responseValueId,
      stepId,
      event,
      reasoningText
    });

    const text = rest.choices?.[0]?.delta?.content || '';
    if (!splitAnswerTextByCharacter) {
      if (text) {
        pushDataToQueue({
          responseValueId,
          stepId,
          event,
          text
        });
      }
    } else {
      for (const item of text) {
        pushDataToQueue({
          responseValueId,
          stepId,
          event,
          text: item
        });
      }
    }
  } else if (event === SseResponseEventEnum.fastAnswer) {
    const reasoningText = rest.choices?.[0]?.delta?.reasoning_content || '';
    pushDataToQueue({
      responseValueId,
      stepId,
      event,
      reasoningText
    });

    const text = rest.choices?.[0]?.delta?.content || '';
    pushDataToQueue({
      responseValueId,
      stepId,
      event,
      text
    });
  } else if (
    event === SseResponseEventEnum.toolCall ||
    event === SseResponseEventEnum.toolParams ||
    event === SseResponseEventEnum.toolResponse ||
    event === SseResponseEventEnum.interactive ||
    event === SseResponseEventEnum.plan ||
    event === SseResponseEventEnum.stepTitle ||
    event === SseResponseEventEnum.skillCall
  ) {
    pushDataToQueue({
      responseValueId,
      stepId,
      event,
      ...rest
    });
  } else if (event === SseResponseEventEnum.flowNodeResponse) {
    onMessage({
      event,
      nodeResponse: rest
    });
  } else if (event === SseResponseEventEnum.updateVariables) {
    onMessage({
      event,
      variables: rest
    });
  } else if (event === SseResponseEventEnum.collectionForm) {
    onMessage({
      event,
      collectionForm: rest
    });
  } else if (event === SseResponseEventEnum.topAgentConfig) {
    onMessage({
      event,
      formData: rest
    });
  } else if (event === SseResponseEventEnum.error) {
    if (rest.statusText === TeamErrEnum.aiPointsNotEnough) {
      useSystemStore.getState().setNotSufficientModalType(TeamErrEnum.aiPointsNotEnough);
    }
    setErrMsg(getErrText(rest, '流响应错误'));
  } else if (
    [SseResponseEventEnum.workflowDuration, SseResponseEventEnum.flowNodeStatus].includes(
      event as any
    )
  ) {
    onMessage({
      event,
      ...rest
    });
  } else if (event === SseResponseEventEnum.sandboxStatus) {
    onMessage({
      event,
      sandboxStatus: rest
    });
  }
};

const runStreamRequest = ({
  url,
  requestInit,
  onMessage,
  abortCtrl
}: {
  url: string;
  requestInit: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
}) =>
  new Promise<StreamResponseType>(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      abortCtrl.abort('Time out');
    }, 60000);

    let responseText = '';
    let responseQueue: ResponseQueueItemType[] = [];
    let errMsg: string | undefined;
    let finished = false;

    const finish = () => {
      if (errMsg !== undefined) {
        return failedFinish();
      }
      return resolve({
        responseText
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

    function animateResponseText() {
      if (abortCtrl.signal.aborted) {
        responseQueue.forEach((item) => {
          onMessage(item);
          if (isAnswerEvent(item.event) && 'text' in item && item.text) {
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
          if (isAnswerEvent(item.event) && 'text' in item && item.text) {
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
    animateResponseText();

    const pushDataToQueue = (data: ResponseQueueItemType) => {
      responseQueue.push(data);

      if (document.hidden) {
        animateResponseText();
      }
    };

    try {
      await fetchEventSource(getWebReqUrl(url), {
        ...requestInit,
        signal: abortCtrl.signal,
        async onopen(res) {
          clearTimeout(timeoutId);
          const contentType = res.headers.get('content-type');

          if (contentType?.startsWith('text/plain')) {
            return failedFinish(await res.clone().text());
          }

          if (
            !res.ok ||
            (res.headers.get('content-type') &&
              !res.headers.get('content-type')?.startsWith(EventStreamContentType)) ||
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
        onmessage: ({ event, data }) => {
          handleStreamMessage({
            event,
            data,
            onMessage,
            pushDataToQueue,
            setErrMsg: (err) => {
              errMsg = err;
            }
          });
        },
        onclose() {
          finished = true;
        },
        onerror(err) {
          console.log(err, 'fetch error');
          clearTimeout(timeoutId);
          failedFinish(getErrText(err));
          throw new Error(err);
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

function runEventSourceRequest({
  url,
  onMessage,
  abortCtrl
}: {
  url: string;
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
}) {
  return new Promise<ResumeStreamResponseType>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      abortCtrl.abort('Time out');
    }, 60000);

    let responseText = '';
    let responseQueue: ResponseQueueItemType[] = [];
    let errMsg: string | undefined;
    let finished = false;
    let receivedTerminalEvent = false;
    let closeEventSource = () => {};
    let resumePhase: StreamResumePhaseEnum = StreamResumePhaseEnum.catchup;
    let completedChat: StreamNoNeedToBeResumeType | undefined;

    const finish = () => {
      if (errMsg !== undefined) {
        return failedFinish();
      }
      return resolve({
        responseText,
        completedChat
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

    const applyMessageItem = (item: ResponseQueueItemType) => {
      onMessage(item);
      if (isAnswerEvent(item.event) && 'text' in item && item.text) {
        responseText += item.text;
      }
    };

    function animateResponseText() {
      if (abortCtrl.signal.aborted) {
        responseQueue.forEach(applyMessageItem);
        return finish();
      }

      if (responseQueue.length > 0) {
        const fetchCount = Math.max(1, Math.round(responseQueue.length / 30));
        for (let i = 0; i < fetchCount; i++) {
          const item = responseQueue[i];
          applyMessageItem(item);
        }

        responseQueue = responseQueue.slice(fetchCount);
      }

      if (finished && responseQueue.length === 0) {
        return finish();
      }

      requestAnimationFrame(animateResponseText);
    }
    animateResponseText();

    const pushDataToQueue = (data: ResponseQueueItemType) => {
      if (resumePhase === StreamResumePhaseEnum.catchup) {
        applyMessageItem(data);
        return;
      }

      responseQueue.push(data);

      if (document.hidden) {
        animateResponseText();
      }
    };

    const stopStream = () => {
      closeEventSource();
    };

    const stream = $esfetch({
      url,
      events: [
        ...Object.values(SseResponseEventEnum),
        StreamResumePhaseEvent,
        StreamResumeCompletedEvent
      ],
      signal: abortCtrl.signal,
      onopen: () => {
        clearTimeout(timeoutId);
      },
      onmessage: ({ event, data }) => {
        if (event === StreamResumePhaseEvent) {
          if (data === StreamResumePhaseEnum.catchup || data === StreamResumePhaseEnum.live) {
            resumePhase = data;
          }
          return;
        }

        if (event === StreamResumeCompletedEvent) {
          try {
            completedChat = JSON.parse(data) as StreamNoNeedToBeResumeType;
          } catch (error) {
            errMsg = getErrText(error, '恢复完成态数据解析失败');
          }
          return;
        }

        if (data === '[DONE]') {
          receivedTerminalEvent = true;
          return;
        }

        handleStreamMessage({
          event,
          data,
          onMessage,
          pushDataToQueue,
          setErrMsg: (err) => {
            errMsg = err;
          },
          splitAnswerTextByCharacter: resumePhase === StreamResumePhaseEnum.live
        });

        if (event === SseResponseEventEnum.error) {
          receivedTerminalEvent = true;
        }
      },
      onerror: (event) => {
        clearTimeout(timeoutId);

        if (abortCtrl.signal.aborted || finished) {
          return;
        }

        stopStream();
        if (receivedTerminalEvent || errMsg !== undefined) {
          finished = true;
          return;
        }

        failedFinish(getErrText(event));
      }
    });

    closeEventSource = stream.close;

    abortCtrl.signal.addEventListener(
      'abort',
      () => {
        finished = true;
        stopStream();
      },
      { once: true }
    );
  });
}

export const streamFetch = ({
  url = '/api/v2/chat/completions',
  data,
  onMessage,
  abortCtrl
}: StreamFetchProps) =>
  (() => {
    const variables = data?.variables || {};
    variables.cTime = formatTime2YMDHMW(new Date());

    return runStreamRequest({
      url,
      requestInit: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...data,
          variables,
          detail: true,
          stream: true,
          retainDatasetCite: data.retainDatasetCite ?? true
        })
      },
      onMessage,
      abortCtrl
    });
  })();

export const streamResumeFetch = ({
  appId,
  chatId,
  onMessage,
  abortCtrl
}: {
  appId: string;
  chatId: string;
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
}) => {
  const query = new URLSearchParams({
    appId,
    chatId
  });

  return runEventSourceRequest({
    url: `/api/v1/stream/resume?${query.toString()}`,
    onMessage,
    abortCtrl
  });
};

export const onOptimizePrompt = async ({
  originalPrompt,
  model,
  input,
  onResult,
  abortController
}: OnOptimizePromptProps) => {
  const controller = abortController || new AbortController();
  await streamFetch({
    url: '/api/core/ai/optimizePrompt',
    data: {
      originalPrompt,
      optimizerInput: input,
      model
    },
    onMessage: ({ event, text }) => {
      if (event === SseResponseEventEnum.answer && text) {
        onResult(text);
      }
    },
    abortCtrl: controller
  });
};

export const onOptimizeCode = async ({
  optimizerInput,
  model,
  conversationHistory = [],
  onResult,
  abortController
}: OnOptimizeCodeProps) => {
  const controller = abortController || new AbortController();
  await streamFetch({
    url: '/api/core/workflow/optimizeCode',
    data: {
      optimizerInput,
      model,
      conversationHistory
    },
    onMessage: ({ event, text }) => {
      if (event === SseResponseEventEnum.answer && text) {
        onResult(text);
      }
    },
    abortCtrl: controller
  });
};

type EsFetchParams = {
  url: string;
  events?: string[];
  signal?: AbortSignal;
  onopen?: () => void;
  onmessage: (event: { event: string; data: string }) => void;
  onerror?: (event: Event) => void;
};

export const $esfetch = ({
  url,
  events = [],
  signal,
  onopen,
  onmessage,
  onerror
}: EsFetchParams) => {
  const es = new EventSource(getWebReqUrl(url));
  const listeners: Array<{ event: string; handler: EventListener }> = [];

  const _bind = (event: string) => {
    const handler: EventListener = ((evt: MessageEvent<string>) => {
      onmessage({
        event,
        data: evt.data
      });
    }) as EventListener;

    es.addEventListener(event, handler);
    listeners.push({ event, handler });
  };

  es.onopen = () => {
    onopen?.();
  };

  es.onmessage = (event: MessageEvent<string>) => {
    onmessage({
      event: 'message',
      data: event.data
    });
  };

  events.forEach(_bind);

  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        es.close();
      },
      { once: true }
    );
  }

  if (onerror) {
    es.onerror = onerror;
  }

  const close = () => {
    listeners.forEach(({ event, handler }) => {
      es.removeEventListener(event, handler);
    });
    es.close();
  };

  return {
    close
  };
};

export const resumeChatStream = (params: ResumeStreamParams) => {
  const search = new URLSearchParams(params);
  const url = `/api/v1/stream/resume?${search.toString()}`;

  return new Promise<void>((resolve, reject) => {
    const { close } = $esfetch({
      url: url,
      events: [...Object.values(SseResponseEventEnum), StreamResumePhaseEvent],
      onmessage: ({ event, data }) => {
        if (event === SseResponseEventEnum.error) {
          close();
          reject(new Error('Failed to resume chat stream'));
          return;
        }

        if (data === '[DONE]') {
          close();
          resolve();
        }
      },
      onerror: (event) => {
        close();
        reject(new Error('Failed to resume chat stream', { cause: event }));
      }
    });
  });
};
