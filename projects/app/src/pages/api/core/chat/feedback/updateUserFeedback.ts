import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updateChatFeedbackCount } from '@fastgpt/service/core/chat/controller';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateUserFeedbackBodySchema,
  UpdateUserFeedbackResponseSchema,
  type UpdateUserFeedbackResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

async function handler(req: ApiRequestProps): Promise<UpdateUserFeedbackResponseType> {
  const { sourceType, sourceId, chatId, dataId, userBadFeedback, userGoodFeedback } = parseApiInput(
    {
      req,
      bodySchema: UpdateUserFeedbackBodySchema
    }
  ).body;
  const chatSourceQuery = buildChatSourceQuery({ sourceType, sourceId });

  const { teamId } = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId
  });

  const chatItem = await MongoChatItem.findOne({
    ...chatSourceQuery,
    chatId,
    dataId,
    obj: ChatRoleEnum.AI
  });
  if (!chatItem) {
    return Promise.reject('Chat item not found');
  }

  await mongoSessionRun(async (session) => {
    // Update ChatItem feedback
    await MongoChatItem.updateOne(
      { ...chatSourceQuery, chatId, dataId, obj: ChatRoleEnum.AI },
      {
        $unset: {
          ...(userBadFeedback === undefined && { userBadFeedback: '' }),
          ...(userGoodFeedback === undefined && { userGoodFeedback: '' })
        },
        $set: {
          ...(userBadFeedback !== undefined && { userBadFeedback }),
          ...(userGoodFeedback !== undefined && { userGoodFeedback })
        }
      },
      { session }
    );

    // Update Chat table feedback statistics (redundant fields for performance)
    await updateChatFeedbackCount({
      sourceType,
      sourceId,
      chatId,
      session
    });

    // Update ChatLog table statistics (data analytics table)
    if (sourceType === ChatSourceTypeEnum.app && chatItem.obj === ChatRoleEnum.AI) {
      const goodFeedbackDelta = (() => {
        if (!userGoodFeedback && chatItem.userGoodFeedback) {
          return -1;
        } else if (userGoodFeedback && !chatItem.userGoodFeedback) {
          return 1;
        }
        return 0;
      })();

      const badFeedbackDelta = (() => {
        if (!userBadFeedback && chatItem.userBadFeedback) {
          return -1;
        } else if (userBadFeedback && !chatItem.userBadFeedback) {
          return 1;
        }
        return 0;
      })();

      await MongoAppChatLog.findOneAndUpdate(
        {
          teamId,
          appId: sourceId,
          chatId
        },
        {
          $inc: {
            goodFeedbackCount: goodFeedbackDelta,
            badFeedbackCount: badFeedbackDelta
          }
        },
        {
          sort: { createTime: -1 }
        }
      );
    }
  });

  return UpdateUserFeedbackResponseSchema.parse(undefined);
}

export default NextAPI(handler);
