import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { getQAModel, getVectorModel } from '@/service/core/ai/model';
import type { DatasetItemType } from '@fastgpt/global/core/dataset/type.d';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id: datasetId } = req.query as {
      id: string;
    };

    if (!datasetId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { dataset, canWrite, isOwner } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: 'r'
    });

    jsonRes<DatasetItemType>(res, {
      data: {
        ...dataset,
        vectorModel: getVectorModel(dataset.vectorModel),
        agentModel: getQAModel(dataset.agentModel),
        canWrite,
        isOwner
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
