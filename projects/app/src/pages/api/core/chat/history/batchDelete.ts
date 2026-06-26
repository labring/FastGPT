import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { ChatBatchDeleteBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteChatResourcesBySource } from '@fastgpt/service/core/chat/delete';

const getBatchDeletePermission = (sourceType: ChatSourceTypeEnum) => {
  if (sourceType === ChatSourceTypeEnum.app) {
    return AppReadChatLogPerVal;
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
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

  await authChatTargetCrud({
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
    chatIds
  });

  return;
}

export default NextAPI(handler);
