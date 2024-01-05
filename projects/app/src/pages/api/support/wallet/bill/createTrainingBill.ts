import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { CreateTrainingBillProps } from '@fastgpt/global/support/wallet/bill/api.d';
import { getQAModel, getVectorModel } from '@/service/core/ai/model';
import { createTrainingBill } from '@fastgpt/service/support/wallet/bill/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { name, vectorModel, agentModel } = req.body as CreateTrainingBillProps;

    const { teamId, tmbId } = await authCert({ req, authToken: true, authApiKey: true });

    const vectorModelData = getVectorModel(vectorModel);
    const agentModelData = getQAModel(agentModel);

    const { billId } = await createTrainingBill({
      teamId,
      tmbId,
      appName: name,
      billSource: BillSourceEnum.training,
      vectorModel: vectorModelData.name,
      agentModel: agentModelData.name
    });

    jsonRes<string>(res, {
      data: billId
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
