import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Collection } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import type { ShareModelItem } from '@/types/model';

/* 获取模型列表 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // 凭证校验
    const userId = await authToken(req.headers.authorization);

    await connectToDatabase();

    // get my collections
    const collections = await Collection.find({
      userId
    }).populate('modelId', '_id avatar name userId share');

    jsonRes<ShareModelItem[]>(res, {
      data: collections
        .map((item: any) => ({
          _id: item.modelId?._id,
          avatar: item.modelId?.avatar || '/icon/logo.png',
          name: item.modelId?.name || '',
          userId: item.modelId?.userId || '',
          share: item.modelId?.share || {},
          isCollection: true
        }))
        .filter((item) => item.share.isShare)
    });
  } catch (err) {
    jsonRes(res, {
      data: []
    });
  }
}
