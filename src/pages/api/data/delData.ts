// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Data, DataItem } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import type { DataListItem } from '@/types/data';
import type { PagingData } from '@/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('缺少登录凭证');
    }

    await authToken(authorization);

    const { dataId } = req.query as { dataId: string };
    if (!dataId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    await Data.findByIdAndUpdate(dataId, {
      isDeleted: true
    });

    // 改变 dataItem 状态为 0
    await DataItem.updateMany(
      {
        dataId
      },
      {
        status: 0
      }
    );

    jsonRes<PagingData<DataListItem>>(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
