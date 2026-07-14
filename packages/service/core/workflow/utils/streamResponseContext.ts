import type { NextApiRequest } from 'next';
import type { StreamResponseContract } from '../../../type/contract';
import { getSseErrorResponse } from '../../../common/response';
import { clearCookie } from '../../../support/permission/auth/common';
import { STREAM_RESUME_REQUEST_HEADER } from '@fastgpt/global/core/chat/constants';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { createSseStreamContext } from '../../../common/response/sse';
import { getStreamResumeMirror } from '../../chat/resume';
import { getWorkflowResponseWrite } from '../dispatch/utils';

type CreateWorkflowStreamResponseContextBaseParams = {
  req: NextApiRequest | { headers?: Record<string, string | undefined> };
  res: StreamResponseContract;
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

export type WorkflowStreamResponseContext = {
  responseWrite: ReturnType<typeof getWorkflowResponseWrite>;
  writeStreamError: (error: unknown) => void;
  /** always present — no-op when stream resume is disabled */
  flushResume: () => Promise<void>;
};

type WorkflowSseResponseController = {
  cleanup: () => void;
};

const workflowSseResponseControllerKey = '__fastgptWorkflowSseResponseController' as const;

type WorkflowSseResponse = StreamResponseContract & {
  [workflowSseResponseControllerKey]?: WorkflowSseResponseController;
};

/**
 * 判断当前 HTTP 响应是否已完成 workflow SSE 初始化。
 *
 * dispatchWorkFlow 依赖这个状态做前置校验，确保 SSE header、心跳和生命周期清理由
 * API 边界显式建立，而不是在 workflow 执行器内部隐式创建。
 */
export const isWorkflowSseResponseInitialized = (res?: StreamResponseContract): boolean => {
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
  res?: StreamResponseContract;
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
        responseWrite?.(workflowSseEvent.answerDelta(''));
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
  params: CreateWorkflowStreamResponseContextParams
): Promise<WorkflowStreamResponseContext>;
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
}: CreateWorkflowStreamResponseContextParams): Promise<WorkflowStreamResponseContext> {
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

  const context: Omit<WorkflowStreamResponseContext, 'flushResume'> = {
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
    return {
      ...context,
      async flushResume() {
        // no-op — stream resume is disabled
      }
    };
  }

  return {
    ...context,
    async flushResume() {
      await mirror?.flush();
      await mirror?.shrinkTTLAfterComplete();
    }
  };
}
