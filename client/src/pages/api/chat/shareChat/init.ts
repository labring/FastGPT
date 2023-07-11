import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ShareChat, User } from '@/service/mongo';
import type { InitShareChatResponse } from '@/api/response/chat';
import { authApp } from '@/service/utils/auth';
import { hashPassword } from '@/service/utils/tools';
import { HUMAN_ICON } from '@/constants/chat';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { SystemInputEnum } from '@/constants/app';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let { shareId } = req.query as {
      shareId: string;
    };

    if (!shareId) {
      throw new Error('params is error');
    }

    await connectToDatabase();

    // get shareChat
    const shareChat = await ShareChat.findOne({ shareId });

    if (!shareChat) {
      return jsonRes(res, {
        code: 501,
        error: '分享链接已失效'
      });
    }

    // 校验使用权限
    const { app } = await authApp({
      appId: shareChat.appId,
      userId: String(shareChat.userId),
      authOwner: false
    });

    const user = await User.findById(shareChat.userId, 'avatar');

    jsonRes<InitShareChatResponse>(res, {
      data: {
        userAvatar: user?.avatar || HUMAN_ICON,
        maxContext:
          app.modules
            ?.find((item) => item.flowType === FlowModuleTypeEnum.historyNode)
            ?.inputs?.find((item) => item.key === 'maxContext')?.value || 0,
        app: {
          variableModules: app.modules
            .find((item) => item.flowType === FlowModuleTypeEnum.userGuide)
            ?.inputs?.find((item) => item.key === SystemInputEnum.variables)?.value,
          welcomeText: app.modules
            .find((item) => item.flowType === FlowModuleTypeEnum.userGuide)
            ?.inputs?.find((item) => item.key === SystemInputEnum.welcomeText)?.value,
          name: app.name,
          avatar: app.avatar,
          intro: app.intro
        }
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
