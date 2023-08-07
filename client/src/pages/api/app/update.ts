import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { App } from '@/service/models/app';
import type { AppUpdateParams } from '@/types/app';
import { authApp } from '@/service/utils/auth';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { name, avatar, type, chat, share, intro, modules } = req.body as AppUpdateParams;
    const { appId } = req.query as { appId: string };

    if (!appId) {
      throw new Error('appId is empty');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    await authApp({
      appId,
      userId
    });

    // 更新模型
    await App.updateOne(
      {
        _id: appId,
        userId
      },
      {
        name,
        type,
        avatar,
        intro,
        chat,
        ...(share && {
          'share.isShare': share.isShare,
          'share.isShareDetail': share.isShareDetail
        }),
        ...(modules && { modules })
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
