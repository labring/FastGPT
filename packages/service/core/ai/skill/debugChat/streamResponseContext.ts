import type { NextApiRequest, NextApiResponse } from 'next';
import { getSseErrorResponse } from '../../../../common/response';
import { clearCookie } from '../../../../support/permission/auth/common';
import { STREAM_RESUME_REQUEST_HEADER } from '@fastgpt/global/core/chat/constants';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getStreamResumeMirror } from '../../../chat/resume';
import { getWorkflowResponseWrite } from '../../../workflow/dispatch/utils';

type CreateSkillDebugStreamResponseContextParams = {
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

/**
 * 创建 Skill 调试对话的 workflow 响应上下文。
 *
 * 该 helper 放在 service 层，供开源 API 和 Pro API 复用；它只负责 SSE writer 与
 * stream resume mirror，不处理 Skill 鉴权、chat round 生命周期和 workflow 调度。
 */
export const createSkillDebugStreamResponseContext = async ({
  req,
  res,
  stream,
  detail,
  teamId,
  sourceType,
  sourceId,
  chatId,
  responseId,
  showNodeStatus = true
}: CreateSkillDebugStreamResponseContextParams) => {
  const mirror = stream
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

export type SkillDebugStreamResponseContext = Awaited<
  ReturnType<typeof createSkillDebugStreamResponseContext>
>;
