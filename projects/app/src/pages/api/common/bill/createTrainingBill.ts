import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Bill } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { BillSourceEnum } from '@/constants/user';
import { CreateTrainingBillType } from '@/api/common/bill/index.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { name } = req.body as CreateTrainingBillType;

    const { userId } = await authUser({ req, authToken: true, authApiKey: true });

    await connectToDatabase();

    const { _id } = await Bill.create({
      userId,
      appName: name,
      source: BillSourceEnum.training,
      list: [
        {
          moduleName: '索引生成',
          model: 'embedding',
          amount: 0,
          tokenLen: 0
        },
        {
          moduleName: 'QA 拆分',
          model: global.qaModel.name,
          amount: 0,
          tokenLen: 0
        }
      ],
      total: 0
    });

    jsonRes<string>(res, {
      data: _id
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
