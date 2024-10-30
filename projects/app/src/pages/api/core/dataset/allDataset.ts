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
    permission: myPer
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
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      resourceId: {
        $exists: true
      }
    }).lean()
  ]);

  const filterDatasets = myDatasets
    .map((dataset) => {
      const per = (() => {
        const myPerList = perList.filter(
          (item) =>
            String(item.tmbId) === String(tmbId) || myGroupIds.includes(String(item.groupId))
        );

        const getPer = (id: string) => {
          const tmbPer = myPerList.find(
            (item) => String(item.resourceId) === id && !!item.tmbId
          )?.permission;
          const groupPer = getGroupPer(
            myPerList
              .filter(
                (item) =>
                  String(item.resourceId) === id && myGroupIds.includes(String(item.groupId))
              )
              .map((item) => item.permission)
          );

          return new DatasetPermission({
            per: tmbPer ?? groupPer ?? DatasetDefaultPermissionVal,
            isOwner: String(dataset.tmbId) === String(tmbId) || myPer.isOwner
          });
        };

        const parentDataset = myDatasets.find(
          (item) => String(item._id) === String(dataset.parentId)
        );

        if (dataset.inheritPermission && dataset.parentId && parentDataset) {
          return getPer(parentDataset._id);
        } else {
          return getPer(dataset._id);
        }
      })();

      return {
        ...dataset,
        permission: per
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
