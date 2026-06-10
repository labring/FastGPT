import type { NextApiRequest, NextApiResponse } from 'next';
import { getSseErrorResponse } from '@fastgpt/service/common/response';
import { clearCookie } from '@fastgpt/service/support/permission/auth/common';
import { STREAM_RESUME_REQUEST_HEADER } from '@fastgpt/global/core/chat/constants';
import { getStreamResumeMirror } from '@fastgpt/service/core/chat/resume';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';

type CreateWorkflowStreamResponseContextParams = {
  req: NextApiRequest;
  res: NextApiResponse;
  stream: boolean;
  detail: boolean;
  teamId: string;
  appId: string;
  chatId: string;
  responseId?: string;
  showNodeStatus?: boolean;
};

/**
 * 创建 workflow 响应上下文，统一管理 SSE writer 与 stream resume 缓存镜像。
 *
 * 该 helper 只处理流式响应和 resume 缓存，不负责 chat 生成锁、轮次创建或失败状态清理。
 * 非流式请求仍会返回 writer，但不会创建 resume mirror；调用方需要自行处理 JSON 错误响应。
 */
export const createWorkflowStreamResponseContext = async ({
  req,
  res,
  stream,
  detail,
  teamId,
  appId,
  chatId,
  responseId,
  showNodeStatus = true
}: CreateWorkflowStreamResponseContextParams) => {
  const mirror = stream
    ? await getStreamResumeMirror({
        resumeRequestHeaderValue: req.headers?.[STREAM_RESUME_REQUEST_HEADER],
        teamId,
        appId,
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

  return {
    responseWrite,
    async flushResume() {
      await mirror?.flush();
      await mirror?.shrinkTTLAfterComplete();
    },
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
};

export type WorkflowStreamResponseContext = Awaited<
  ReturnType<typeof createWorkflowStreamResponseContext>
>;
