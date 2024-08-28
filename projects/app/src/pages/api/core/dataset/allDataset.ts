import type { NextApiRequest } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import type { DatasetSimpleItemType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

/* get all dataset by teamId or tmbId */
async function handler(req: NextApiRequest): Promise<DatasetSimpleItemType[]> {
  const {
    teamId,
    tmbId,
    permission: tmbPer
  } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const [myDatasets, rpList] = await Promise.all([
    MongoDataset.find({
      teamId,
      type: {
        $ne: DatasetTypeEnum.folder
      }
    })
      .sort({
        updateTime: -1
      })
      .lean(),
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      tmbId
    }).lean()
  ]);

  const filterDatasets = myDatasets
    .map((dataset) => {
      const perVal = rpList.find(
        (item) => String(item.resourceId) === String(dataset._id)
      )?.permission;
      const Per = new DatasetPermission({
        per: perVal ?? dataset.defaultPermission,
        isOwner: String(dataset.tmbId) === tmbId || tmbPer.isOwner
      });

      return {
        ...dataset,
        permission: Per
      };
    })
    .filter((app) => app.permission.hasReadPer);

  return filterDatasets.map((item) => ({
    _id: item._id,
    avatar: item.avatar,
    name: item.name,
    vectorModel: getVectorModel(item.vectorModel)
  }));
}

export default NextAPI(handler);
