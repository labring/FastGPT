import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  HelperBotCompletionsParamsSchema,
  type HelperBotCompletionsParamsType
} from '@fastgpt/global/openapi/core/chat/helperBot/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoHelperBotChatItem } from '@fastgpt/service/core/chat/HelperBot/chatItemSchema';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';
import { dispatchMap } from '@fastgpt/service/core/chat/HelperBot/dispatch/index';
import { pushChatRecords } from '@fastgpt/service/core/chat/HelperBot/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { sseErrRes } from '@fastgpt/service/common/response';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

export type completionsBody = HelperBotCompletionsParamsType;

async function handler(req: ApiRequestProps<completionsBody>, res: ApiResponseType<any>) {
  const logger = getLogger(LogCategories.MODULE.AI.HELPERBOT);
  const setSSEHeaders = () => {
    const headers: Record<string, string> = {
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream;charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
      'Cache-Control': 'no-cache, no-transform'
    };
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  };

  let chatId = '';
  let chatItemId = '';
  let metadataType = '';

  // keep consistent with SSE APIs, otherwise stream consumer may treat response as non-SSE
  setSSEHeaders();

  try {
    const {
      chatId: _chatId,
      chatItemId: _chatItemId,
      query,
      files,
      metadata
    } = HelperBotCompletionsParamsSchema.parse(req.body);
    chatId = _chatId;
    chatItemId = _chatItemId;
    metadataType = metadata.type;

    const { teamId, tmbId, userId, isRoot } = await authCert({ req, authToken: true });

    // Limit
    await authFrequencyLimit({
      eventId: `${tmbId}-helperBot-completions`,
      maxAmount: 10,
      expiredTime: addSeconds(new Date(), 60)
    }).catch(() => {
      return Promise.reject('Frequency limit exceeded');
    });

    const histories = await MongoHelperBotChatItem.find({
      userId,
      chatId
    })
      .sort({ _id: -1 })
      .limit(40)
      .lean();
    histories.reverse();

    const workflowResponseWrite = getWorkflowResponseWrite({
      res,
      detail: true,
      streamResponse: true,
      id: chatId,
      showNodeStatus: true
    });

    // 执行不同逻辑
    const fn = dispatchMap[metadata.type];
    if (!fn) {
      return Promise.reject('Invalid helper bot type');
    }
    const result = await fn({
      query,
      files,
      data: metadata.data,
      histories,
      workflowResponseWrite,
      user: {
        teamId,
        tmbId,
        userId,
        isRoot,
        lang: getLocale(req)
      }
    });

    // Save chat
    await pushChatRecords({
      type: metadata.type,
      userId,
      chatId,
      chatItemId,
      query,
      files,
      aiResponse: result.aiResponse
    });
    // Push usage
    // pushHelperBotUsage({
    //   teamId,
    //   tmbId,
    //   model: result.usage.model,
    //   inputTokens: result.usage.inputTokens,
    //   outputTokens: result.usage.outputTokens
    // });
  } catch (error) {
    logger.error('HelperBot completions failed', {
      error,
      chatId,
      chatItemId,
      metadataType
    });
    sseErrRes(res, error);
  }

  res.end();
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    },
    responseLimit: '20mb'
  }
};
