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
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { toChatAuthQueryTarget, type ChatAuthTargetInput } from '@/web/core/chat/utils';
import {
  EventStreamContentType,
  fetchEventSource,
  type FetchEventSourceInit
} from '@fortaine/fetch-event-source';
import { formatTime2YMDHMW } from '@fastgpt/global/common/string/time';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import type { OnOptimizePromptProps } from '@/components/common/PromptEditor/OptimizerPopover';
import type { OnOptimizeCodeProps } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode/Copilot';
import { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import type { StreamNoNeedToBeResumeType } from '@fastgpt/global/openapi/core/ai/api';
import { getLanguageRequestHeaders } from '@fastgpt/web/i18n/utils';

type StreamFetchProps = {
  url?: string;
  data: Record<string, any>;
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
  requestMode?: 'chat' | 'raw';
};
export type StreamResponseType = {
  responseText: string;
  title?: string;
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
    '/api/core/chat/chatTest',
    '/api/proApi/core/chat/chatAgentHelper/completions',
    '/api/proApi/core/workflow/builder/chat',
    '/api/core/ai/skill/debugChat',
    '/api/proApi/core/ai/skill/debugChat'
  ]).has(url);

type CommonResponseType = {
  responseValueId?: string;
};
type AnswerQueueItem = CommonResponseType & {
  event: SseResponseEventEnum.fastAnswer | SseResponseEventEnum.answer;
  text?: string;
  reasoningText?: string;
};

const STREAM_TYPING_QUEUE_COUNT_WHILE_STREAMING = 1;

/**
 * 控制客户端流式文本的打字机消费速度。
 *
 * 流仍在持续返回时保持稳定慢吐，避免模型输出快或网络批量到达时一次性渲染太多字符；
 * 服务端已 close 后一次性清空队列，使最后一批内容在同一次 UI 提交中完整显示。
 */
export const getStreamTypingQueueConsumeCount = ({
  queueLength,
  finished
}: {
  queueLength: number;
  finished: boolean;
}) => {
  if (queueLength <= 0) return 0;

  return finished ? queueLength : Math.min(queueLength, STREAM_TYPING_QUEUE_COUNT_WHILE_STREAMING);
};

type HandleEventSourceDataParams = {
  event: string;
  data: string;
  onmessage: StartChatFnProps['generatingMessage'];
  enqueue: (data: AnswerQueueItem) => void;
  onerror: (err: string) => void;
  splitAnswerTextByCharacter?: boolean;
};
/** 解析单条 SSE 数据；只有回答文本进入打字队列，其他事件立即派发。 */
export function handleEventSourceData(params: HandleEventSourceDataParams) {
  const { event, data, onmessage, enqueue, onerror, splitAnswerTextByCharacter = true } = params;

  if (data === '[DONE]') {
    return;
  }

  try {
    const parsed: any = JSON.parse(data);
    if (typeof parsed !== 'object') throw new Error('Invalid JSON');

    const { responseValueId, ...obj } = parsed;

    switch (event) {
      case SseResponseEventEnum.toolCall:
      case SseResponseEventEnum.toolParams:
      case SseResponseEventEnum.toolResponse:
      case SseResponseEventEnum.interactive:
      case SseResponseEventEnum.plan:
      case SseResponseEventEnum.planStatus:
      case SseResponseEventEnum.skillCall: {
        onmessage({ responseValueId, event, ...obj });
        break;
      }

      case SseResponseEventEnum.workflowBuilderApplied: {
        onmessage({ responseValueId, event, workflowBuilderApplied: obj });
        break;
      }

      case SseResponseEventEnum.workflowBuilderVersion: {
        onmessage({ responseValueId, event, workflowBuilderVersion: obj.version });
        break;
      }

      case SseResponseEventEnum.answer: {
        const reasoningText = obj.choices?.[0]?.delta?.reasoning_content || '';
        enqueue({ responseValueId, event, reasoningText });

        const content = obj.choices?.[0]?.delta?.content || '';

        if (splitAnswerTextByCharacter) {
          for (const item of content) {
            enqueue({ responseValueId, event, text: item });
          }
        } else {
          enqueue({ responseValueId, event, text: content });
        }

        break;
      }

      case SseResponseEventEnum.fastAnswer: {
        const reasoningText = obj.choices?.[0]?.delta?.reasoning_content || '';
        enqueue({ responseValueId, event, reasoningText });

        const text = obj.choices?.[0]?.delta?.content || '';
        enqueue({ responseValueId, event, text });

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

      case AuxiliaryGenerationEventEnum.chatAgentConfig: {
        onmessage({ event, formData: obj });
        break;
      }

      case AuxiliaryGenerationEventEnum.status: {
        onmessage({ event, ...obj });
        break;
      }

      case SseResponseEventEnum.sandboxStatus: {
        onmessage({ event, sandboxStatus: obj });
        break;
      }

      case SseResponseEventEnum.error: {
        const error = getErrText(obj, i18nT('common:stream_response_error'));
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

      case SseResponseEventEnum.chatTitle: {
        onmessage({ event, title: obj.title });
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
    let title: string | undefined;
    let responseQueue: AnswerQueueItem[] = [];
    let error: string | undefined;
    let finished = false;

    const applyAnswerItem = (item: AnswerQueueItem) => {
      onmessage(item);
      if (item.text) responseText += item.text;
    };
    const flushAnswerQueue = () => {
      responseQueue.forEach(applyAnswerItem);
      responseQueue = [];
    };
    const dispatchNonAnswerMessage: StartChatFnProps['generatingMessage'] = (message) => {
      // 控制事件是顺序屏障：先补齐此前收到的文本，再立即更新工具或状态。
      flushAnswerQueue();
      onmessage(message);
    };

    const onfailed = (err?: any) => {
      finished = true;
      reject({
        message: getErrText(err, error ?? i18nT('common:response_processing_error')),
        responseText
      });
    };

    const onfinish = () => {
      if (error !== undefined) {
        return onfailed();
      }

      return resolve({ responseText, title });
    };

    function animateResponseLoop() {
      if (signal.aborted) {
        flushAnswerQueue();

        return onfinish();
      }

      if (responseQueue.length > 0) {
        const fetchCount = getStreamTypingQueueConsumeCount({
          queueLength: responseQueue.length,
          finished
        });
        for (let i = 0; i < fetchCount; i++) {
          applyAnswerItem(responseQueue[i]);
        }

        responseQueue = responseQueue.slice(fetchCount);
      }

      if (finished && responseQueue.length === 0) {
        return onfinish();
      }

      requestAnimationFrame(animateResponseLoop);
    }

    animateResponseLoop();

    const enqueue = (data: AnswerQueueItem) => {
      responseQueue.push(data);

      if (document.hidden) {
        animateResponseLoop();
      }
    };

    try {
      const fetchEventSourceOptions: FetchEventSourceInit = {
        ...restRequestInit,
        headers: {
          ...getLanguageRequestHeaders(),
          ...headersInitToRecord(initHeaders)
        },
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
          if (event === SseResponseEventEnum.chatTitle) {
            try {
              title = JSON.parse(data)?.title;
            } catch {}
          }
          handleEventSourceData({
            event,
            data,
            onmessage: dispatchNonAnswerMessage,
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
  onResumeUnavailable?: (data: ResumeUnavailableType) => void;
  controller: AbortController;
};
function $resumefetch({ url, onmessage, onResumeUnavailable, controller }: ResumeSSEFetchParams) {
  const signal = controller.signal;

  return new Promise<ResumeStreamResponseType>(async (resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort('Timeout');
    }, 60000);

    let responseText = '';
    let title: string | undefined;
    let responseQueue: AnswerQueueItem[] = [];
    let error: string | undefined;
    let finished = false;
    let resumePhase: StreamResumePhaseEnum = StreamResumePhaseEnum.catchup;
    let completedChat: StreamNoNeedToBeResumeType | undefined;
    let resumeUnavailable: ResumeUnavailableType | undefined;

    const onfinish = () => {
      if (error !== undefined) {
        return onfailed();
      }
      return resolve({ responseText, title, completedChat, resumeUnavailable });
    };
    const onAbort = () => {
      finished = true;
      responseQueue = [];
      return onfinish();
    };
    const onfailed = (err?: any) => {
      finished = true;
      const message = getErrText(err, error ?? i18nT('common:response_processing_error'));
      reject({
        message,
        responseText,
        isStreamError: error !== undefined
      } satisfies ResumeStreamErrorType);
    };

    const applyAnswerItem = (item: AnswerQueueItem) => {
      onmessage(item);
      if (item.text) responseText += item.text;
    };
    const flushAnswerQueue = () => {
      responseQueue.forEach(applyAnswerItem);
      responseQueue = [];
    };
    const dispatchNonAnswerMessage: StartChatFnProps['generatingMessage'] = (message) => {
      // 恢复直播同样以控制事件为屏障，避免工具状态越过尚未展示的回答。
      flushAnswerQueue();
      onmessage(message);
    };

    function animateResponseLoop() {
      if (signal.aborted) {
        return onAbort();
      }

      if (responseQueue.length > 0) {
        const fetchCount = getStreamTypingQueueConsumeCount({
          queueLength: responseQueue.length,
          finished
        });
        for (let i = 0; i < fetchCount; i++) {
          const item = responseQueue[i];
          applyAnswerItem(item);
        }

        responseQueue = responseQueue.slice(fetchCount);
      }

      if (finished && responseQueue.length === 0) {
        return onfinish();
      }

      requestAnimationFrame(animateResponseLoop);
    }

    animateResponseLoop();

    const enqueue = (data: AnswerQueueItem) => {
      if (signal.aborted) return;

      if (resumePhase === StreamResumePhaseEnum.catchup) {
        applyAnswerItem(data);
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
        headers: getLanguageRequestHeaders(),
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
          if (signal.aborted) return;

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
              error = getErrText(parseErr, i18nT('common:resume_completed_data_parse_failed'));
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
            onResumeUnavailable?.(resumeUnavailable);
            return;
          }

          if (data === '[DONE]') {
            return;
          }

          if (event === SseResponseEventEnum.chatTitle) {
            try {
              title = JSON.parse(data)?.title;
            } catch {}
          }

          handleEventSourceData({
            event,
            data,
            onmessage: dispatchNonAnswerMessage,
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
        return onAbort();
      }

      onfailed(err);
    }
  });
}

/**
 * 构造 SSE 请求体。普通聊天保留运行参数注入；独立辅助模块使用 raw 模式原样发送契约数据。
 */
export const buildStreamFetchBody = ({
  data,
  requestMode = 'chat'
}: Pick<StreamFetchProps, 'data' | 'requestMode'>) => {
  if (requestMode === 'raw') return data;

  const rawVars = data?.variables;
  const variables = {
    ...(rawVars && typeof rawVars === 'object' && !Array.isArray(rawVars)
      ? (rawVars as Record<string, unknown>)
      : {}),
    cTime: formatTime2YMDHMW(new Date())
  };

  return {
    ...data,
    variables,
    detail: true,
    stream: true,
    retainDatasetCite: data.retainDatasetCite ?? true
  };
};

export const streamFetch = ({
  url = '/api/v2/chat/completions',
  data,
  onMessage,
  abortCtrl,
  requestMode = 'chat'
}: StreamFetchProps) => {
  const shouldEnableStreamResume = shouldSendStreamResumeHeader(url);

  return $ssefetch({
    url,
    requestInit: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getLanguageRequestHeaders(),
        ...(shouldEnableStreamResume && {
          [STREAM_RESUME_REQUEST_HEADER]: STREAM_RESUME_REQUEST_HEADER_ENABLED
        })
      },
      body: JSON.stringify(buildStreamFetchBody({ data, requestMode }))
    },
    onmessage: onMessage,
    abortController: abortCtrl
  });
};

/** 使用共享 SSE 生命周期，但不注入普通聊天的 Workflow 运行参数。 */
export const streamRawFetch = (props: Omit<StreamFetchProps, 'requestMode'>) =>
  streamFetch({ ...props, requestMode: 'raw' });

type StreamResumeFetchParams = ChatAuthTargetInput & {
  chatId: string;
  onmessage: StartChatFnProps['generatingMessage'];
  onResumeUnavailable?: (data: ResumeUnavailableType) => void;
  controller: AbortController;
};

const activeResumeControllerMap = new Map<string, AbortController>();

/**
 * 激活指定会话的续流控制器。
 *
 * 同一会话的新请求会替换旧请求；不同来源或 chatId 的续流相互独立，避免同页多个
 * ChatBox 互相中断。返回的清理函数只清理仍由当前 controller 占用的会话。
 */
export const activateStreamResumeController = (resumeKey: string, controller: AbortController) => {
  const activeController = activeResumeControllerMap.get(resumeKey);
  if (activeController && activeController !== controller) {
    activeController.abort('replace');
  }
  activeResumeControllerMap.set(resumeKey, controller);

  return () => {
    if (activeResumeControllerMap.get(resumeKey) === controller) {
      activeResumeControllerMap.delete(resumeKey);
    }
  };
};

/**
 * 构造聊天续流地址。
 *
 * App、Skill、分享链接和显式 sourceType 必须复用统一的 chat target 转换规则，
 * 避免 Workflow Builder 等独立会话资源被错误地按普通 App 会话恢复。
 */
export const buildStreamResumeUrl = ({
  chatId,
  chatTarget
}: {
  chatId: string;
  chatTarget: ChatAuthTargetInput;
}) => {
  const query = new URLSearchParams({ chatId });
  Object.entries(toChatAuthQueryTarget(chatTarget)).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });

  return `/api/core/chat/resume?${query}`;
};

export async function streamResumeFetch(params: StreamResumeFetchParams) {
  const { chatId, onmessage, onResumeUnavailable, controller } = params;
  const url = buildStreamResumeUrl({ chatId, chatTarget: params });
  const deactivateController = activateStreamResumeController(url, controller);

  return $resumefetch({ url, onmessage, onResumeUnavailable, controller }).finally(
    deactivateController
  );
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
