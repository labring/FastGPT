// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Data } from '@/service/mongo';
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

    const { dataId, name } = req.query as { dataId: string; name: string };
    if (!dataId || !name) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    await Data.findByIdAndUpdate(dataId, {
      name
    });

    jsonRes<PagingData<DataListItem>>(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
