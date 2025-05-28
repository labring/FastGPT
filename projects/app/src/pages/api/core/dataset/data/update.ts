import { updateData2Dataset } from '@/service/core/dataset/data/controller';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { type UpdateDatasetDataProps } from '@fastgpt/global/core/dataset/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetData } from '@fastgpt/service/support/permission/dataset/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { MongoDatasetCollectionImage } from '@fastgpt/service/core/dataset/image/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';

async function handler(req: ApiRequestProps<UpdateDatasetDataProps>) {
  const { dataId, q, a, indexes = [], imageId } = req.body;

  // auth data permission
  const {
    collection: {
      dataset: { vectorModel }
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
      inputTokens: tokens,
      model: vectorModel
    });
  }

  // Remove image TTL to prevent expiration during training
  if (imageId) {
    await MongoDatasetCollectionImage.updateOne(
      {
        _id: imageId,
        teamId: teamId
      },
      {
        $unset: {
          expiredTime: 1
        }
      }
    );
  }
}

export default NextAPI(handler);
