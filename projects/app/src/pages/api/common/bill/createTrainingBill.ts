import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoBill } from '@fastgpt/service/common/bill/schema';
import { authUser } from '@fastgpt/service/support/user/auth';
import { BillSourceEnum } from '@fastgpt/global/common/bill/constants';
import { CreateTrainingBillType } from '@fastgpt/global/common/bill/types/billReq.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { name } = req.body as CreateTrainingBillType;

    const { teamId, tmbId } = await authUser({ req, authToken: true, authApiKey: true });

    const qaModel = global.qaModels[0];

    const { _id } = await MongoBill.create({
      teamId,
      tmbId,
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
          model: qaModel?.name,
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
