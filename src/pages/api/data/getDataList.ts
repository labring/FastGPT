// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Data, DataItem } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import type { DataSchema } from '@/types/mongoSchema';
import type { DataListItem } from '@/types/data';
import type { PagingData } from '@/types';
import mongoose from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;
    let { pageNum = 1, pageSize = 10 } = req.query as { pageNum: string; pageSize: string };

    pageNum = +pageNum;
    pageSize = +pageSize;

    if (!authorization) {
      throw new Error('缺少登录凭证');
    }

    const userId = await authToken(authorization);

    await connectToDatabase();

    const datalist = await Data.aggregate<DataListItem>([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          isDeleted: false
        }
      },
      {
        $sort: { createTime: -1 } // 按照创建时间倒序排列
      },
      {
        $skip: (pageNum - 1) * pageSize // 跳过前面的数据
      },
      {
        $limit: pageSize // 取出指定数量的数据
      },
      {
        $lookup: {
          from: 'dataitems',
          localField: '_id',
          foreignField: 'dataId',
          as: 'items'
        }
      },
      {
        $addFields: {
          totalData: {
            $size: '$items' // 统计dataItem的总数
          },
          trainingData: {
            $size: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $eq: ['$$item.status', 1] } // 统计status为1的数量
              }
            }
          }
        }
      },
      {
        $project: {
          items: 0 // 不返回 items 字段
        }
      }
    ]);

    jsonRes<PagingData<DataListItem>>(res, {
      data: {
        pageNum,
        pageSize,
        data: datalist,
        total: 1
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
