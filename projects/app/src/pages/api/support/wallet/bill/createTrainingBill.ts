import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { BillSourceEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { CreateTrainingBillProps } from '@fastgpt/global/support/wallet/bill/api.d';
import { getLLMModel, getVectorModel } from '@/service/core/ai/model';
import { createTrainingBill } from '@fastgpt/service/support/wallet/bill/controller';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { name, datasetId } = req.body as CreateTrainingBillProps;

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: 'w'
    });

    const { billId } = await createTrainingBill({
      teamId,
      tmbId,
      appName: name,
      billSource: BillSourceEnum.training,
      vectorModel: getVectorModel(dataset.vectorModel).name,
      agentModel: getLLMModel(dataset.agentModel).name
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
