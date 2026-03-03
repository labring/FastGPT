import type { NextApiResponse } from 'next';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updateChatFeedbackCount } from '@fastgpt/service/core/chat/controller';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  UpdateUserFeedbackBodySchema,
  UpdateUserFeedbackResponseSchema,
  type UpdateUserFeedbackResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse
): Promise<UpdateUserFeedbackResponseType> {
  const { appId, chatId, dataId, userBadFeedback, userGoodFeedback } =
    UpdateUserFeedbackBodySchema.parse(req.body);

  const { teamId } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.body
  });

  const chatItem = await MongoChatItem.findOne({ appId, chatId, dataId });
  if (!chatItem) {
    return Promise.reject('Chat item not found');
  }

  await mongoSessionRun(async (session) => {
    // Update ChatItem feedback
    await MongoChatItem.updateOne(
      { appId, chatId, dataId },
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
      appId,
      chatId,
      session
    });

    // Update ChatLog table statistics (data analytics table)
    if (chatItem.obj === ChatRoleEnum.AI) {
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

      await MongoAppChatLog.updateOne(
        {
          teamId,
          appId,
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

  return UpdateUserFeedbackResponseSchema.parse({});
}

export default NextAPI(handler);
