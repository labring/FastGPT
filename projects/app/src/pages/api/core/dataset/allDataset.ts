import type { NextApiRequest } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import type { DatasetSimpleItemType } from '@fastgpt/global/core/dataset/type.d';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

/* get all dataset by teamId or tmbId */
async function handler(req: NextApiRequest): Promise<DatasetSimpleItemType[]> {
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const myDatasets = await MongoDataset.find({
    teamId,
    type: {
      $ne: DatasetTypeEnum.folder
    }
  })
    .sort({
      updateTime: -1
    })
    .lean();

  return myDatasets.map((item) => ({
    _id: item._id,
    avatar: item.avatar,
    name: item.name,
    vectorModel: getVectorModel(item.vectorModel)
  }));
}

export default NextAPI(handler);
