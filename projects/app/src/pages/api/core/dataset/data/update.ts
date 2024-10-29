import { updateData2Dataset } from '@/service/core/dataset/data/controller';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { UpdateDatasetDataProps } from '@fastgpt/global/core/dataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps<UpdateDatasetDataProps>) {
  const { dataId, q, a, indexes = [] } = req.body;

  // auth data permission
  const {
    collection: {
      datasetId: { vectorModel }
    },
    teamId,
    tmbId
  } = await authDatasetData({
    req,
    authToken: true,
    authApiKey: true,
    dataId,
    per: WritePermissionVal
  });

  if (q || a || indexes.length > 0) {
    const { tokens } = await updateData2Dataset({
      dataId,
      q,
      a,
      indexes,
      model: vectorModel
    });

    pushGenerateVectorUsage({
      teamId,
      tmbId,
      tokens,
      model: vectorModel
    });
  } else {
    // await MongoDatasetData.findByIdAndUpdate(dataId, {
    //   ...(forbid !== undefined && { forbid })
    // });
  }
}

export default NextAPI(handler);
