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
import { pushHelperBotUsage } from '@/service/support/wallet/usage/push';
import { getLocale } from '@fastgpt/service/common/middle/i18n';

export type completionsBody = HelperBotCompletionsParamsType;

async function handler(req: ApiRequestProps<completionsBody>, res: ApiResponseType<any>) {
  const { chatId, chatItemId, query, files, metadata } = HelperBotCompletionsParamsSchema.parse(
    req.body
  );

  const { teamId, tmbId, userId, isRoot } = await authCert({ req, authToken: true });

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
  // console.log('=== HelperBot Completions ===');
  // console.log('chatId:', chatId);
  // console.log('chatItemId:', chatItemId);
  // console.log('query:', query);
  // console.log('files:', files);
  // console.log('metadata:', JSON.stringify(metadata, null, 2));

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
  pushHelperBotUsage({
    teamId,
    tmbId,
    model: result.usage.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens
  });
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
