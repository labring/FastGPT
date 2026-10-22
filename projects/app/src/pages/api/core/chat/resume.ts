import type { NextApiRequest, NextApiResponse } from 'next';
import {
  ResumeStreamParamsSchema,
  type StreamNoNeedToBeResumeType
} from '@fastgpt/global/openapi/core/ai/api';
import { NextAPI } from '@/service/middleware/entry';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  StreamResumeCompletedEvent,
  StreamResumePhaseEnum,
  StreamResumePhaseEvent,
  StreamResumeUnavailableEvent
} from '@fastgpt/global/core/workflow/runtime/constants';
import {
  STREAM_RESUME_TTL_SECONDS,
  catchUpAllHistoryItems,
  _resume,
  getStreamResumeUnavailableState
} from '@fastgpt/service/core/chat/resume';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';
import {
  chatItemResponsePreviewProjection,
  transformPreviewHistories
} from '@/global/core/chat/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { CHAT_GENERATION_LEASE_TTL_MS } from '@fastgpt/service/core/chat/generationLease';

const completedChatPageSize = 10;
const resumeUnavailablePollIntervalMs = 3000;
const resumeUnavailableMaxWaitMs = STREAM_RESUME_TTL_SECONDS * 1000;
type CurrentChatState = Pick<StreamNoNeedToBeResumeType, 'chatGenerateStatus' | 'hasBeenRead'> & {
  generationRunId?: string;
};
const resumeGeneratingRequiresSseMessage =
  'This chat is still generating. Retry /api/core/chat/resume with Accept: text/event-stream.';
const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);

const isResponseClosed = (res: NextApiResponse) =>
  !!(res.closed || res.writableEnded || res.destroyed);

const writeResumePhase = (res: NextApiResponse, phase: StreamResumePhaseEnum) => {
  if (isResponseClosed(res)) return;
  res.write(`event: ${StreamResumePhaseEvent}\ndata: ${phase}\n\n`);
};

const writeSseEvent = (res: NextApiResponse, event: string, data: string) => {
  if (isResponseClosed(res)) return;
  res.write(`event: ${event}\ndata: ${data}\n\n`);
};

const writeSseComment = (res: NextApiResponse, comment: string) => {
  if (isResponseClosed(res)) return;
  res.write(`: ${comment}\n\n`);
};

const resolveResumeGenerationRunId = (chat: {
  generationRunId?: string;
  generationHeartbeatAt?: Date;
  updateTime?: Date;
}) => {
  if (!chat.generationRunId || !chat.generationHeartbeatAt) return;
  if (
    chat.updateTime &&
    chat.updateTime.getTime() - chat.generationHeartbeatAt.getTime() > CHAT_GENERATION_LEASE_TTL_MS
  ) {
    return;
  }
  return chat.generationRunId;
};

const writeResumeUnavailable = (
  res: NextApiResponse,
  data: Awaited<ReturnType<typeof getStreamResumeUnavailableState>>
) => {
  if (!data) return;
  writeSseEvent(res, StreamResumeUnavailableEvent, JSON.stringify(data));
};

const initSseResponse = (res: NextApiResponse) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
};

const shouldRespondWithSse = (req: NextApiRequest) => {
  const accept = req.headers?.accept;
  if (Array.isArray(accept)) {
    return accept.some((item) => item.includes('text/event-stream'));
  }
  return accept?.includes('text/event-stream') ?? false;
};

export const config = {
  api: {
    // 仅使用 query，无 body；关闭默认 body 解析以免干扰
    bodyParser: false
  }
};

// GET /api/core/chat/resume?chatId=xxx&appId=xxx 或 skillId=xxx（断线续传）
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { chatId, sourceType, sourceId, outLinkAuthData } = parseApiInput({
    req,
    querySchema: ResumeStreamParamsSchema
  }).query;
  const respondWithSse = shouldRespondWithSse(req);

  const authRes = await authChatTargetCrud({
    sourceType,
    sourceId,
    req,
    chatId,
    outLinkAuthData,
    authToken: true
  });
  const { teamId, showCite = true } = authRes;
  const resolvedSourceId = authRes.sourceId;

  const findCurrentChat = async (): Promise<CurrentChatState> => {
    const chat = await MongoChat.findOne(
      { chatId, ...buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId }) },
      {
        hasBeenRead: 1,
        chatGenerateStatus: 1,
        generationRunId: 1,
        generationHeartbeatAt: 1,
        updateTime: 1
      }
    ).lean();
    if (!chat) {
      return Promise.reject(new Error('Chat not found'));
    }
    return {
      hasBeenRead: chat.hasBeenRead ?? false,
      chatGenerateStatus: chat.chatGenerateStatus ?? ChatGenerateStatusEnum.done,
      generationRunId: resolveResumeGenerationRunId(chat)
    };
  };

  const findCompletedChat = async (): Promise<StreamNoNeedToBeResumeType> => {
    const chat = await findCurrentChat();
    const result = await getChatItems({
      sourceType,
      sourceId: resolvedSourceId,
      chatId,
      field:
        'obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg customFeedbacks isFeedbackRead deleteTime',
      limit: completedChatPageSize,
      nodeResponseMode: 'preview',
      nodeResponsePreviewProjection: chatItemResponsePreviewProjection
    });

    const histories = await addPreviewUrlToChatItems(result.histories, 'chatFlow');

    const list = transformPreviewHistories(histories, showCite).map((item) => ({
      ...item,
      id: item.dataId!
    }));
    const lastAi = list.findLast((item) => item.obj === ChatRoleEnum.AI);
    if (!lastAi || (!lastAi.value?.length && !lastAi.errorMsg)) {
      logger.warn('Resume returned a completed chat without a finalized AI response', {
        sourceType,
        sourceId: resolvedSourceId,
        chatId,
        generationRunId: chat.generationRunId
      });
    }

    return {
      ...chat,
      hasBeenRead: true,
      records: {
        list,
        total: result.total,
        hasMorePrev: result.hasMorePrev,
        hasMoreNext: result.hasMoreNext
      }
    };
  };

  const makeSureTheCompletedChatHasBeenRead = async () => {
    await MongoChat.updateOne(
      { ...buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId }), chatId },
      { $set: { hasBeenRead: true } }
    );
  };

  const waitForCompletedChat = async () => {
    const deadlineAt = Date.now() + resumeUnavailableMaxWaitMs;

    while (!isResponseClosed(res)) {
      const chat = await findCurrentChat();

      if (chat.chatGenerateStatus !== ChatGenerateStatusEnum.generating) {
        await makeSureTheCompletedChatHasBeenRead();
        return findCompletedChat();
      }

      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) {
        return;
      }

      writeSseComment(res, 'ping');
      await delay(Math.min(resumeUnavailablePollIntervalMs, remainingMs));
    }
  };

  const { chatGenerateStatus, generationRunId } = await findCurrentChat();

  // Chat has been completed, no need to catch up history items and resume stream
  if (chatGenerateStatus !== ChatGenerateStatusEnum.generating) {
    await makeSureTheCompletedChatHasBeenRead();
    const completedChat = await findCompletedChat();

    if (!respondWithSse) {
      return completedChat;
    }

    initSseResponse(res);
    writeSseEvent(res, StreamResumeCompletedEvent, JSON.stringify(completedChat));
    writeSseEvent(res, 'done', '[DONE]');
    res.end();
    return;
  }

  if (!respondWithSse) {
    res.status(406).json({
      code: 406,
      statusText: 'error',
      message: resumeGeneratingRequiresSseMessage,
      data: null
    });
    return;
  }

  initSseResponse(res);

  req.on('close', () => {
    res.end();
  });

  const unavailableState = await getStreamResumeUnavailableState({
    teamId,
    sourceType,
    sourceId: resolvedSourceId,
    chatId,
    generationRunId
  });

  writeResumePhase(res, StreamResumePhaseEnum.catchup);

  if (unavailableState) {
    writeResumeUnavailable(res, unavailableState);
    const completedChat = await waitForCompletedChat();
    if (completedChat) {
      writeSseEvent(res, StreamResumeCompletedEvent, JSON.stringify(completedChat));
    }
    writeSseEvent(res, 'done', '[DONE]');
    res.end();
    return;
  }

  const cursor = await catchUpAllHistoryItems({
    res,
    teamId,
    sourceType,
    sourceId: resolvedSourceId,
    chatId,
    generationRunId
  });

  writeResumePhase(res, StreamResumePhaseEnum.live);
  await _resume({
    res,
    teamId,
    sourceType,
    sourceId: resolvedSourceId,
    chatId,
    generationRunId,
    cursor
  });

  res.end();
}

export default NextAPI(handler);
