import type { NextApiRequest, NextApiResponse } from 'next';
import {
  ResumeStreamParamsSchema,
  type StreamNoNeedToBeResumeType
} from '@fastgpt/global/openapi/core/ai/api';
import { NextAPI } from '@/service/middleware/entry';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import {
  DispatchNodeResponseKeyEnum,
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
import { transformPreviewHistories } from '@/global/core/chat/utils';
import { delay } from '@fastgpt/global/common/system/utils';

const completedChatPageSize = 10;
const resumeUnavailablePollIntervalMs = 3000;
const resumeUnavailableMaxWaitMs = STREAM_RESUME_TTL_SECONDS * 1000;
type CurrentChatState = Pick<StreamNoNeedToBeResumeType, 'chatGenerateStatus' | 'hasBeenRead'>;
const resumeGeneratingRequiresSseMessage =
  'This chat is still generating. Retry /api/core/chat/resume with Accept: text/event-stream.';

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

// GET /api/core/chat/resume?chatId=xxx&appId=xxx&teamId=xxx（与 /v2/chat/completions 配套，断线续传）
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    chatId,
    appId,
    teamId: requestTeamId,
    teamToken,
    shareId,
    outLinkUid
  } = await ResumeStreamParamsSchema.parseAsync(req.query);
  const respondWithSse = shouldRespondWithSse(req);

  const { teamId, showCite = true } = await authChatCrud({
    appId,
    req,
    chatId,
    teamId: requestTeamId,
    teamToken,
    shareId,
    outLinkUid,
    authToken: true
  });

  const findCurrentChat = async (): Promise<CurrentChatState> => {
    const chat = await MongoChat.findOne(
      { chatId, appId },
      { hasBeenRead: 1, chatGenerateStatus: 1 }
    ).lean();
    if (!chat) {
      return Promise.reject(new Error('Chat not found'));
    }
    return {
      hasBeenRead: chat.hasBeenRead ?? false,
      chatGenerateStatus: chat.chatGenerateStatus ?? ChatGenerateStatusEnum.done
    };
  };

  const findCompletedChat = async (): Promise<StreamNoNeedToBeResumeType> => {
    const chat = await findCurrentChat();
    const result = await getChatItems({
      appId,
      chatId,
      field: `obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg ${DispatchNodeResponseKeyEnum.nodeResponse} customFeedbacks isFeedbackRead deleteTime`,
      limit: completedChatPageSize
    });

    await addPreviewUrlToChatItems(result.histories, 'chatFlow');

    const list = transformPreviewHistories(result.histories, showCite).map((item) => ({
      ...item,
      id: item.dataId!
    }));

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
    await MongoChat.updateOne({ appId, chatId }, { $set: { hasBeenRead: true } });
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

  const { chatGenerateStatus } = await findCurrentChat();

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
    appId,
    chatId
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

  const cursor = await catchUpAllHistoryItems({ res, teamId, appId, chatId });

  writeResumePhase(res, StreamResumePhaseEnum.live);
  await _resume({ res, teamId, appId, chatId, cursor });

  res.end();
}

export default NextAPI(handler);
