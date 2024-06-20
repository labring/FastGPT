/* push data to training queue */
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import type {
  PushDatasetDataProps,
  PushDatasetDataResponse
} from '@fastgpt/global/core/dataset/api.d';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const body = req.body as PushDatasetDataProps;
  const { collectionId, data } = body;

  if (!collectionId || !Array.isArray(data)) {
    throw new Error('collectionId or data is empty');
  }

  if (data.length > 200) {
    throw new Error('Data is too long, max 200');
  }

  // 凭证校验
  const { teamId, tmbId, collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: WritePermissionVal
  });

  // auth dataset limit
  await checkDatasetLimit({
    teamId,
    insertLen: predictDataLimitLength(collection.trainingType, data)
  });

  jsonRes<PushDatasetDataResponse>(res, {
    data: await pushDataListToTrainingQueue({
      ...body,
      teamId,
      tmbId,
      datasetId: collection.datasetId._id,
      agentModel: collection.datasetId.agentModel,
      vectorModel: collection.datasetId.vectorModel
    })
  });
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '12mb'
  }
};
