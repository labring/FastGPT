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
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { sseErrRes } from '@fastgpt/service/common/response';

export type completionsBody = HelperBotCompletionsParamsType;

async function handler(req: ApiRequestProps<completionsBody>, res: ApiResponseType<any>) {
  const { chatId, chatItemId, query, files, metadata } = HelperBotCompletionsParamsSchema.parse(
    req.body
  );

  const { teamId, tmbId, userId, isRoot } = await authCert({ req, authToken: true });

  // Limit
  await authFrequencyLimit({
    eventId: `${tmbId}-helperBot-completions`,
    maxAmount: 10,
    expiredTime: addSeconds(new Date(), 60)
  }).catch((err) => {
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

  // 设置 SSE 响应头，确保前端 fetchEventSource 识别为流式响应
  res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  const workflowResponseWrite = getWorkflowResponseWrite({
    res,
    detail: true,
    streamResponse: true,
    id: chatId,
    showNodeStatus: true
  });

  try {
    // 执行不同逻辑
    const fn = dispatchMap[metadata.type];
    if (!fn) {
      throw new Error('Invalid helper bot type');
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

    res.end();
  } catch (err) {
    sseErrRes(res, err);
    res.end();
  }
  // Push usage
  // pushHelperBotUsage({
  //   teamId,
  //   tmbId,
  //   model: result.usage.model,
  //   inputTokens: result.usage.inputTokens,
  //   outputTokens: result.usage.outputTokens
  // });
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
