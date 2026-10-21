import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { ChatBatchDeleteBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteChatResourcesBySource } from '@fastgpt/service/core/chat/delete';

const getBatchDeletePermission = (sourceType: ChatSourceTypeEnum) => {
  if (sourceType === ChatSourceTypeEnum.app) {
    return AppReadChatLogPerVal;
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return WritePermissionVal;
  }

  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    return AppReadChatLogPerVal;
  }

  if (sourceType === ChatSourceTypeEnum.workflowBuilder) {
    return WritePermissionVal;
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
};

async function handler(req: ApiRequestProps) {
  const { sourceType, sourceId, chatIds } = parseApiInput({
    req,
    bodySchema: ChatBatchDeleteBodySchema
  }).body;

  const authResult = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    per: getBatchDeletePermission(sourceType)
  });

  await deleteChatResourcesBySource({
    sourceType,
    sourceId,
    chatIds,
    scope: authResult.scope
  });

  return;
}

export default NextAPI(handler);
