import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { jsonRes } from '@fastgpt/service/common/response';
import { QueryUserParams, UserListItemType } from '@/global/support/api/userRes';
import { PagingData } from '@/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    let { pageNum = 1, pageSize = 10, username = '', status } = req.query as QueryUserParams;

    const match = {
      ...(username ? { username } : {}),
      ...(status ? { status } : {})
    };
    const [data, total] = await Promise.all([
      MongoUser.find(match, '_id username status createTime')
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      MongoUser.countDocuments(match)
    ]);

    jsonRes<PagingData<UserListItemType>>(res, {
      data: {
        pageNum,
        pageSize,
        data,
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
