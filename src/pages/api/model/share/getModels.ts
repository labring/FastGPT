import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { Model } from '@/service/models/model';
import type { PagingData } from '@/types';
import type { ShareModelItem } from '@/types/model';

/* 获取模型列表 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // 凭证校验
    await authToken(req.headers.authorization);

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

    // 根据分享的模型
    const models = await Model.find(where, '_id avatar name userId share')
      .sort({
        'share.collection': -1
      })
      .limit(pageSize)
      .skip((pageNum - 1) * pageSize);

    jsonRes<PagingData<ShareModelItem>>(res, {
      data: {
        pageNum,
        pageSize,
        data: models,
        total: await Model.countDocuments(where)
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
