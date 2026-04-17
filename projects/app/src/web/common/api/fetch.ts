import {
  SseResponseEventEnum,
  StreamResumeCompletedEvent,
  StreamResumePhaseEnum,
  StreamResumePhaseEvent,
  StreamResumeUnavailableEvent,
  StreamResumeUnavailableReasonEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import {
  STREAM_RESUME_REQUEST_HEADER,
  STREAM_RESUME_REQUEST_HEADER_ENABLED
} from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import {
  EventStreamContentType,
  fetchEventSource,
  type FetchEventSourceInit
} from '@fortaine/fetch-event-source';
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
import type { StreamNoNeedToBeResumeType } from '@fastgpt/global/openapi/core/ai/api';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

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
  resumeUnavailable?: ResumeUnavailableType;
};
export type ResumeStreamErrorType = {
  message: string;
  responseText: string;
  isStreamError?: boolean;
};

export type ResumeUnavailableType = {
  reason: `${StreamResumeUnavailableReasonEnum}`;
};

const shouldSendStreamResumeHeader = (url: string) =>
  new Set([
    '/api/v2/chat/completions',
    '/api/proApi/core/chat/chatHome',
    '/api/core/chat/chatTest'
  ]).has(url);

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

type HandleEventSourceDataParams = {
  event: string;
  data: string;
  onmessage: StartChatFnProps['generatingMessage'];
  enqueue: (data: ResponseQueueItemType) => void;
  onerror: (err: string) => void;
  splitAnswerTextByCharacter?: boolean;
};
function handleEventSourceData(params: HandleEventSourceDataParams) {
  const { event, data, onmessage, enqueue, onerror, splitAnswerTextByCharacter = true } = params;

  if (data === '[DONE]') {
    return;
  }

  try {
    const parsed: any = JSON.parse(data);
    if (typeof parsed !== 'object') throw new Error('Invalid JSON');

    const { responseValueId, stepId, ...obj } = parsed;

    switch (event) {
      case SseResponseEventEnum.toolCall:
      case SseResponseEventEnum.toolParams:
      case SseResponseEventEnum.toolResponse:
      case SseResponseEventEnum.interactive:
      case SseResponseEventEnum.plan:
      case SseResponseEventEnum.stepTitle:
      case SseResponseEventEnum.skillCall: {
        enqueue({ responseValueId, stepId, event, ...obj });
        break;
      }

      case SseResponseEventEnum.answer: {
        const reasoningText = obj.choices?.[0]?.delta?.reasoning_content || '';
        enqueue({ responseValueId, stepId, event, reasoningText });

        const content = obj.choices?.[0]?.delta?.content || '';

        if (splitAnswerTextByCharacter) {
          for (const item of content) {
            enqueue({ responseValueId, stepId, event, text: item });
          }
        } else {
          enqueue({ responseValueId, stepId, event, text: content });
        }

        break;
      }

      case SseResponseEventEnum.fastAnswer: {
        const reasoningText = obj.choices?.[0]?.delta?.reasoning_content || '';
        enqueue({ responseValueId, stepId, event, reasoningText });

        const text = obj.choices?.[0]?.delta?.content || '';
        enqueue({ responseValueId, stepId, event, text });

        break;
      }

      case SseResponseEventEnum.flowNodeResponse: {
        onmessage({ event, nodeResponse: obj });
        break;
      }

      case SseResponseEventEnum.updateVariables: {
        onmessage({ event, variables: obj });
        break;
      }

      case SseResponseEventEnum.collectionForm: {
        onmessage({ event, collectionForm: obj });
        break;
      }

      case SseResponseEventEnum.topAgentConfig: {
        onmessage({ event, formData: obj });
        break;
      }

      case SseResponseEventEnum.sandboxStatus: {
        onmessage({ event, sandboxStatus: obj });
        break;
      }

      case SseResponseEventEnum.error: {
        const error = getErrText(obj, '流响应错误');
        onerror(error);
        break;
      }

      case SseResponseEventEnum.workflowDuration: {
        onmessage({ event, ...obj });
        break;
      }

      case SseResponseEventEnum.flowNodeStatus: {
        onmessage({ event, ...obj });
        break;
      }

      default: {
        throw new Error(`Unsupported event: ${event}`);
      }
    }
  } catch {
    // NOOP
  }
}

/** FetchEventSourceInit 将 headers 收窄为 Record；RequestInit 为 HeadersInit，需先归一化 */
function headersInitToRecord(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (headers === undefined) return undefined;
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

type SSEFetchParams = {
  url: string;
  requestInit: RequestInit;
  onmessage: StartChatFnProps['generatingMessage'];
  abortController: AbortController;
};
function $ssefetch(params: SSEFetchParams) {
  const { url, requestInit, onmessage, abortController } = params;
  const signal = abortController.signal;
  const { headers: initHeaders, ...restRequestInit } = requestInit;

  return new Promise<StreamResponseType>(async (resolve, reject) => {
    const timer = setTimeout(() => {
      abortController.abort('Timeout');
    }, 60000);

    let responseText = '';
    let responseQueue: ResponseQueueItemType[] = [];
    let error: string | undefined;
    let finished = false;

    const onfailed = (err?: any) => {
      finished = true;
      reject({ message: getErrText(err, error ?? '响应过程出现异常~'), responseText });
    };

    const onfinish = () => {
      if (error !== undefined) {
        return onfailed();
      }

      return resolve({ responseText });
    };

    const isAnswerEvent = (event: SseResponseEventEnum) => {
      return event === SseResponseEventEnum.answer || event === SseResponseEventEnum.fastAnswer;
    };

    function animateResponseLoop() {
      if (signal.aborted) {
        responseQueue.forEach((item) => {
          onmessage(item);
          if (isAnswerEvent(item.event) && 'text' in item && item.text) {
            responseText += item.text;
          }
        });

        return onfinish();
      }

      if (responseQueue.length > 0) {
        const fetchCount = Math.max(1, Math.round(responseQueue.length / 30));
        for (let i = 0; i < fetchCount; i++) {
          const item = responseQueue[i];
          onmessage(item);
          if (isAnswerEvent(item.event) && 'text' in item && item.text) {
            responseText += item.text;
          }
        }

        responseQueue = responseQueue.slice(fetchCount);
      }

      if (finished && responseQueue.length === 0) {
        return onfinish();
      }

      requestAnimationFrame(animateResponseLoop);
    }

    animateResponseLoop();

    const enqueue = (data: ResponseQueueItemType) => {
      responseQueue.push(data);

      if (document.hidden) {
        animateResponseLoop();
      }
    };

    try {
      const fetchEventSourceOptions: FetchEventSourceInit = {
        ...restRequestInit,
        headers: headersInitToRecord(initHeaders),
        signal,
        async onopen(res) {
          clearTimeout(timer);
          const contentType = res.headers.get('content-type');

          if (contentType?.startsWith('text/plain')) {
            return onfailed(await res.clone().text());
          }

          if (!res.ok || !contentType?.startsWith(EventStreamContentType) || res.status !== 200) {
            try {
              onfailed(await res.clone().json());
            } catch {
              const error = await res.clone().text();
              if (!error.startsWith('event: error')) {
                onfailed();
              }
            }
          }
        },
        onmessage: ({ event, data }) => {
          handleEventSourceData({
            event,
            data,
            onmessage,
            enqueue,
            onerror: (err) => void (error = err)
          });
        },
        onclose() {
          finished = true;
        },
        onerror(err) {
          clearTimeout(timer);
          const error = getErrText(err);
          onfailed(error);

          throw new Error(err);
        },
        openWhenHidden: true
      };

      await fetchEventSource(getWebReqUrl(url), fetchEventSourceOptions);
    } catch (err: unknown) {
      clearTimeout(timer);

      if (abortController.signal.aborted) {
        finished = true;
        return;
      }

      const error = getErrText(err);
      onfailed(error);
    }
  });
}

type ResumeSSEFetchParams = {
  url: string;
  onmessage: StartChatFnProps['generatingMessage'];
  controller: AbortController;
};
function $resumefetch({ url, onmessage, controller }: ResumeSSEFetchParams) {
  const signal = controller.signal;

  return new Promise<ResumeStreamResponseType>(async (resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort('Timeout');
    }, 60000);

    let responseText = '';
    let responseQueue: ResponseQueueItemType[] = [];
    let error: string | undefined;
    let finished = false;
    let resumePhase: StreamResumePhaseEnum = StreamResumePhaseEnum.catchup;
    let completedChat: StreamNoNeedToBeResumeType | undefined;
    let resumeUnavailable: ResumeUnavailableType | undefined;

    const onfinish = () => {
      if (error !== undefined) {
        return onfailed();
      }
      return resolve({ responseText, completedChat, resumeUnavailable });
    };
    const onfailed = (err?: any) => {
      finished = true;
      const message = getErrText(err, error ?? '响应过程出现异常~');
      reject({
        message,
        responseText,
        isStreamError: error !== undefined
      } satisfies ResumeStreamErrorType);
    };

    const isAnswerEvent = (event: SseResponseEventEnum) => {
      return event === SseResponseEventEnum.answer || event === SseResponseEventEnum.fastAnswer;
    };

    const applyMessageItem = (item: ResponseQueueItemType) => {
      onmessage(item);
      if (isAnswerEvent(item.event) && 'text' in item && item.text) {
        responseText += item.text;
      }
    };

    function animateResponseLoop() {
      if (signal.aborted) {
        responseQueue.forEach(applyMessageItem);
        return onfinish();
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
        return onfinish();
      }

      requestAnimationFrame(animateResponseLoop);
    }

    animateResponseLoop();

    const enqueue = (data: ResponseQueueItemType) => {
      if (resumePhase === StreamResumePhaseEnum.catchup) {
        applyMessageItem(data);
        return;
      }

      responseQueue.push(data);

      if (document.hidden) {
        animateResponseLoop();
      }
    };

    try {
      const req = new Request(getWebReqUrl(url));

      await fetchEventSource(req, {
        signal: signal,
        async onopen(res) {
          clearTimeout(timer);
          const contentType = res.headers.get('content-type');

          if (contentType?.startsWith('text/plain')) {
            return onfailed(await res.clone().text());
          }

          if (!res.ok || !contentType?.startsWith(EventStreamContentType) || res.status !== 200) {
            try {
              onfailed(await res.clone().json());
            } catch {
              const error = await res.clone().text();
              if (!error.startsWith('event: error')) {
                onfailed();
              }
            }
          }
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
            } catch (parseErr) {
              error = getErrText(parseErr, '恢复完成态数据解析失败');
            }
            return;
          }

          if (event === StreamResumeUnavailableEvent) {
            try {
              resumeUnavailable = JSON.parse(data) as ResumeUnavailableType;
            } catch {
              resumeUnavailable = {
                reason: StreamResumeUnavailableReasonEnum.mirrorUnavailable
              };
            }
            return;
          }

          if (data === '[DONE]') {
            return;
          }

          handleEventSourceData({
            event,
            data,
            onmessage: onmessage,
            enqueue: enqueue,
            onerror: (e) => void (error = e),
            splitAnswerTextByCharacter: resumePhase === StreamResumePhaseEnum.live
          });
        },
        onclose() {
          finished = true;
        },
        onerror(err) {
          clearTimeout(timer);

          if (controller.signal.aborted || finished) {
            return;
          }

          const error = getErrText(err);
          onfailed(error);
          throw new Error(error);
        },
        openWhenHidden: true
      });
    } catch (err: unknown) {
      clearTimeout(timer);

      if (controller.signal.aborted) {
        finished = true;
        return;
      }

      onfailed(err);
    }
  });
}

export const streamFetch = ({
  url = '/api/v2/chat/completions',
  data,
  onMessage,
  abortCtrl
}: StreamFetchProps) => {
  const rawVars = data?.variables;
  const variables = {
    ...(rawVars && typeof rawVars === 'object' && !Array.isArray(rawVars)
      ? (rawVars as Record<string, unknown>)
      : {}),
    cTime: formatTime2YMDHMW(new Date())
  };
  const shouldEnableStreamResume = shouldSendStreamResumeHeader(url);

  return $ssefetch({
    url,
    requestInit: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(shouldEnableStreamResume && {
          [STREAM_RESUME_REQUEST_HEADER]: STREAM_RESUME_REQUEST_HEADER_ENABLED
        })
      },
      body: JSON.stringify({
        ...data,
        variables,
        detail: true,
        stream: true,
        retainDatasetCite: data.retainDatasetCite ?? true
      })
    },
    onmessage: onMessage,
    abortController: abortCtrl
  });
};

type StreamResumeFetchParams = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  onmessage: StartChatFnProps['generatingMessage'];
  controller: AbortController;
};
export function streamResumeFetch(params: StreamResumeFetchParams) {
  const { appId, chatId, outLinkAuthData, onmessage, controller } = params;
  const query = new URLSearchParams({ appId, chatId });

  Object.entries(outLinkAuthData || {}).forEach(([key, value]) => {
    if (!value) return;
    query.set(key, value);
  });

  const url = `/api/core/chat/resume?${query}`;

  return $resumefetch({ url, onmessage, controller });
}

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
