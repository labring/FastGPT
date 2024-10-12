import type { NextApiRequest } from 'next';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import type { DatasetSimpleItemType } from '@fastgpt/global/core/dataset/type.d';
import { NextAPI } from '@/service/middleware/entry';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { DatasetDefaultPermissionVal } from '@fastgpt/global/support/permission/dataset/constant';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getGroupPer } from '@fastgpt/service/support/permission/controller';

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

  const myGroupIds = (
    await getGroupsByTmbId({
      tmbId,
      teamId
    })
  ).map((item) => String(item._id));

  const [myDatasets, perList] = await Promise.all([
    MongoDataset.find({
      teamId
    })
      .sort({
        updateTime: -1
      })
      .lean(),
    MongoResourcePermission.find({
      $and: [
        {
          resourceType: PerResourceTypeEnum.dataset,
          teamId
        },
        { $or: [{ tmbId }, { groupId: { $in: myGroupIds } }] }
      ]
    }).lean()
  ]);

  const filterDatasets = myDatasets
    .map((dataset) => {
      const perVal = (() => {
        const parentDataset = myDatasets.find(
          (item) => String(item._id) === String(dataset.parentId)
        );

        if (dataset.inheritPermission && dataset.parentId && parentDataset) {
          const tmbPer = perList.find(
            (item) => String(item.resourceId) === String(parentDataset._id) && !!item.tmbId
          )?.permission;
          const groupPer = getGroupPer(
            perList
              .filter(
                (item) =>
                  String(item.resourceId) === String(parentDataset._id) &&
                  myGroupIds.includes(String(item.groupId))
              )
              .map((item) => item.permission)
          );
          return tmbPer ?? groupPer ?? DatasetDefaultPermissionVal;
        } else {
          const tmbPer = perList.find(
            (item) => String(item.resourceId) === String(dataset._id) && !!item.tmbId
          )?.permission;
          const groupPer = getGroupPer(
            perList
              .filter(
                (item) =>
                  String(item.resourceId) === String(dataset._id) &&
                  myGroupIds.includes(String(item.groupId))
              )
              .map((item) => item.permission)
          );
          return tmbPer ?? groupPer ?? DatasetDefaultPermissionVal;
        }
      })();

      const Per = new DatasetPermission({
        per: perVal ?? DatasetDefaultPermissionVal,
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
