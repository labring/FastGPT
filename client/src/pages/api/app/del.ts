import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Chat, App, connectToDatabase, Collection, OutLink } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { authApp } from '@/service/utils/auth';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { appId } = req.query as { appId: string };

    if (!appId) {
      throw new Error('参数错误');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    // 验证是否是该用户的 app
    await authApp({
      appId,
      userId
    });

    // 删除对应的聊天
    await Chat.deleteMany({
      appId
    });

    // 删除收藏列表
    await Collection.deleteMany({
      modelId: appId
    });

    // 删除分享链接
    await OutLink.deleteMany({
      appId
    });

    // 删除模型
    await App.deleteOne({
      _id: appId,
      userId
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
