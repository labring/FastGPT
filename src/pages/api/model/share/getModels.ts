import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Collection, Model } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import type { PagingData } from '@/types';
import type { ShareModelItem } from '@/types/model';

/* 获取模型列表 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const {
      searchText = '',
      pageNum = 1,
      pageSize = 20
    } = req.body as { searchText: string; pageNum: number; pageSize: number };

    await connectToDatabase();

    const regex = new RegExp(searchText, 'i');

    const where = {
      $and: [
        { 'share.isShare': true },
        { $or: [{ name: { $regex: regex } }, { 'share.intro': { $regex: regex } }] }
      ]
    };

    // 获取被分享的模型
    const [models, total] = await Promise.all([
      Model.find(where, '_id avatar name userId share')
        .sort({
          'share.collection': -1
        })
        .limit(pageSize)
        .skip((pageNum - 1) * pageSize),
      Model.countDocuments(where)
    ]);

    jsonRes<PagingData<ShareModelItem>>(res, {
      data: {
        pageNum,
        pageSize,
        data: models.map((item) => ({
          _id: item._id,
          avatar: item.avatar || '/icon/logo.png',
          name: item.name,
          userId: item.userId,
          share: item.share,
          isCollection: false
        })),
        total
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
