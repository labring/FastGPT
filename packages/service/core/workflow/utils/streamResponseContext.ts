import type { NextApiRequest, NextApiResponse } from 'next';
import { getSseErrorResponse } from '../../../common/response';
import { clearCookie } from '../../../support/permission/auth/common';
import { STREAM_RESUME_REQUEST_HEADER } from '@fastgpt/global/core/chat/constants';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import { createSseStreamContext } from '../../../common/response/sse';
import { getStreamResumeMirror } from '../../chat/resume';
import { getWorkflowResponseWrite } from '../dispatch/utils';

type CreateWorkflowStreamResponseContextBaseParams = {
  req: NextApiRequest;
  res: NextApiResponse;
  stream: boolean;
  detail: boolean;
  teamId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
  responseId?: string;
  showNodeStatus?: boolean;
};

type CreateWorkflowStreamResponseContextParams = CreateWorkflowStreamResponseContextBaseParams & {
  enableStreamResume?: boolean;
};

type CreateWorkflowStreamResponseContextWithResumeParams =
  CreateWorkflowStreamResponseContextBaseParams & {
    enableStreamResume?: true;
  };

type CreateWorkflowStreamResponseContextWithoutResumeParams =
  CreateWorkflowStreamResponseContextBaseParams & {
    enableStreamResume: false;
  };

type WorkflowStreamResponseContextBase = {
  responseWrite: ReturnType<typeof getWorkflowResponseWrite>;
  writeStreamError: (error: unknown) => void;
};

export type WorkflowStreamResponseContextWithResume = WorkflowStreamResponseContextBase & {
  flushResume: () => Promise<void>;
};

export type WorkflowStreamResponseContextWithoutResume = WorkflowStreamResponseContextBase;

export type WorkflowStreamResponseContext<EnableStreamResume extends boolean = true> =
  EnableStreamResume extends false
    ? WorkflowStreamResponseContextWithoutResume
    : WorkflowStreamResponseContextWithResume;

type WorkflowSseResponseController = {
  cleanup: () => void;
};

const workflowSseResponseControllerKey = '__fastgptWorkflowSseResponseController' as const;

type WorkflowSseResponse = NextApiResponse & {
  [workflowSseResponseControllerKey]?: WorkflowSseResponseController;
};

/**
 * 判断当前 HTTP 响应是否已完成 workflow SSE 初始化。
 *
 * dispatchWorkFlow 依赖这个状态做前置校验，确保 SSE header、心跳和生命周期清理由
 * API 边界显式建立，而不是在 workflow 执行器内部隐式创建。
 */
export const isWorkflowSseResponseInitialized = (res?: NextApiResponse): boolean => {
  if (!res) return false;
  return !!(res as WorkflowSseResponse)[workflowSseResponseControllerKey];
};

/**
 * 幂等初始化 workflow SSE 响应。
 *
 * chat 入口会在 dispatchWorkFlow 前创建 writer 并可能提前写出标题事件，因此 SSE header
 * 必须早于旁路事件写入。调用方需要在 dispatchWorkFlow 前显式调用该 helper 或创建完整
 * stream context，dispatchWorkFlow 只负责校验，不再隐式初始化 SSE。
 */
export const initWorkflowSseResponse = ({
  res,
  stream,
  responseWrite,
  onError
}: {
  res?: NextApiResponse;
  stream: boolean;
  responseWrite?: ReturnType<typeof getWorkflowResponseWrite>;
  onError?: () => void;
}): void => {
  if (!stream || !res) {
    return;
  }

  const workflowRes = res as WorkflowSseResponse;
  if (workflowRes[workflowSseResponseControllerKey]) {
    return;
  }

  const sseContext = createSseStreamContext({
    res,
    stream,
    onError,
    onCleanup: () => {
      delete workflowRes[workflowSseResponseControllerKey];
    },
    // 10s 发送一次空 answer，沿用统一 SSE writer，避免浏览器或代理认为长连接已断开。
    heartbeat: {
      write: () => {
        responseWrite?.(streamSseEvent.answerDelta(''));
      }
    }
  });

  const controller: WorkflowSseResponseController = {
    cleanup: () => {
      sseContext.cleanup();
    }
  };
  workflowRes[workflowSseResponseControllerKey] = controller;
};

/**
 * 创建 workflow 响应上下文，统一管理 SSE writer 与 stream resume 缓存镜像。
 *
 * 该 helper 处理 SSE header、writer 和可选的 resume 缓存，不负责 chat 生成锁、轮次创建或失败状态清理。
 * 非流式请求仍会返回 writer，但不会创建 resume mirror；调用方需要自行处理 JSON 错误响应。
 */
export function createWorkflowStreamResponseContext(
  params: CreateWorkflowStreamResponseContextWithoutResumeParams
): Promise<WorkflowStreamResponseContext<false>>;
export function createWorkflowStreamResponseContext(
  params: CreateWorkflowStreamResponseContextWithResumeParams
): Promise<WorkflowStreamResponseContext>;
export function createWorkflowStreamResponseContext(
  params: CreateWorkflowStreamResponseContextParams
): Promise<WorkflowStreamResponseContext | WorkflowStreamResponseContext<false>>;
export async function createWorkflowStreamResponseContext({
  req,
  res,
  stream,
  detail,
  teamId,
  sourceType,
  sourceId,
  chatId,
  responseId,
  showNodeStatus = true,
  enableStreamResume = true
}: CreateWorkflowStreamResponseContextParams): Promise<
  WorkflowStreamResponseContext | WorkflowStreamResponseContext<false>
> {
  const shouldEnableStreamResume = enableStreamResume !== false;
  const mirror =
    stream && shouldEnableStreamResume
      ? await getStreamResumeMirror({
          resumeRequestHeaderValue: req.headers?.[STREAM_RESUME_REQUEST_HEADER],
          teamId,
          sourceType,
          sourceId,
          chatId
        })
      : undefined;

  const responseWrite = getWorkflowResponseWrite({
    res,
    detail,
    streamResponse: stream,
    id: responseId,
    showNodeStatus,
    streamResumeMirror: mirror
  });

  initWorkflowSseResponse({
    res,
    stream,
    responseWrite
  });

  const context: WorkflowStreamResponseContextWithoutResume = {
    responseWrite,
    writeStreamError(error: unknown) {
      if (!stream) return;

      const { event, data, shouldClearCookie } = getSseErrorResponse(error);
      if (shouldClearCookie) {
        clearCookie(res);
      }
      responseWrite({
        event,
        data
      });
    }
  };

  if (!shouldEnableStreamResume) {
    return context;
  }

  return {
    ...context,
    async flushResume() {
      await mirror?.flush();
      await mirror?.shrinkTTLAfterComplete();
    }
  };
}
