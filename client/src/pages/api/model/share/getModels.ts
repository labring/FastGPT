import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Model } from '@/service/mongo';
import type { PagingData } from '@/types';
import type { ShareModelItem } from '@/types/model';
import { parseCookie } from '@/service/utils/auth';
import { Types } from 'mongoose';

/* 获取模型列表 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const {
      searchText = '',
      pageNum = 1,
      pageSize = 20
    } = req.body as { searchText: string; pageNum: number; pageSize: number };

    await connectToDatabase();

    let userId = '';

    try {
      userId = await parseCookie(req.headers.cookie);
    } catch (error) {
      error;
    }

    const regex = new RegExp(searchText, 'i');

    const where = {
      $and: [
        { 'share.isShare': true },
        {
          $or: [{ name: { $regex: regex } }, { intro: { $regex: regex } }]
        }
      ]
    };
    const pipeline = [
      {
        $match: where
      },
      {
        $lookup: {
          from: 'collections',
          let: { modelId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$modelId', '$$modelId'] },
                    {
                      $eq: ['$userId', userId ? new Types.ObjectId(userId) : new Types.ObjectId()]
                    }
                  ]
                }
              }
            }
          ],
          as: 'collections'
        }
      },
      {
        $project: {
          _id: 1,
          avatar: { $ifNull: ['$avatar', '/icon/logo.png'] },
          name: 1,
          userId: 1,
          intro: 1,
          share: 1,
          isCollection: {
            $cond: {
              if: { $gt: [{ $size: '$collections' }, 0] },
              then: true,
              else: false
            }
          }
        }
      },
      {
        $sort: { 'share.topNum': -1, 'share.collection': -1 }
      },
      {
        $skip: (pageNum - 1) * pageSize
      },
      {
        $limit: pageSize
      }
    ];

    // 获取被分享的模型
    const [models, total] = await Promise.all([
      // @ts-ignore
      Model.aggregate(pipeline),
      Model.countDocuments(where)
    ]);

    jsonRes<PagingData<ShareModelItem>>(res, {
      data: {
        pageNum,
        pageSize,
        data: models,
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
