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
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

export type completionsBody = HelperBotCompletionsParamsType;

async function handler(req: ApiRequestProps<completionsBody>, res: ApiResponseType<any>) {
  const { chatId, chatItemId, query, files, metadata } = HelperBotCompletionsParamsSchema.parse(
    req.body
  );

  const { teamId, userId } = await authCert({ req, authToken: true });

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
  const result = await fn({
    query,
    files,
    metadata,
    histories,
    workflowResponseWrite,
    teamId,
    userId
  });

  // Send formData if exists
  if (result.formData) {
    workflowResponseWrite?.({
      event: SseResponseEventEnum.formData,
      data: result.formData
    });
  }

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
