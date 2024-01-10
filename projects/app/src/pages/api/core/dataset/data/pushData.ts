/* push data to training queue */
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { TrainingModeEnum, TrainingTypeMap } from '@fastgpt/global/core/dataset/constant';
import type { PushDataResponse } from '@/global/core/api/datasetRes.d';
import type { PushDatasetDataProps } from '@/global/core/dataset/api.d';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/limit/dataset';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataToDatasetCollection } from '@/service/core/dataset/data/controller';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { collectionId, data } = req.body as PushDatasetDataProps;

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
      per: 'w'
    });

    // auth dataset limit
    await checkDatasetLimit({
      teamId,
      freeSize: global.feConfigs?.subscription?.datasetStoreFreeSize,
      insertLen: predictDataLimitLength(collection.trainingType, data)
    });

    jsonRes<PushDataResponse>(res, {
      data: await pushDataToDatasetCollection({
        ...req.body,
        teamId,
        tmbId
      })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '12mb'
  }
};
