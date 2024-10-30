import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getVectorModel } from '@fastgpt/service/core/ai/model';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { DatasetDefaultPermissionVal } from '@fastgpt/global/support/permission/dataset/constant';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getGroupPer } from '@fastgpt/service/support/permission/controller';

export type GetDatasetListBody = {
  parentId: ParentIdType;
  type?: DatasetTypeEnum;
  searchKey?: string;
};

async function handler(req: ApiRequestProps<GetDatasetListBody>) {
  const { parentId, type, searchKey } = req.body;
  // 凭证校验
  const {
    dataset: parentDataset,
    teamId,
    tmbId,
    permission: myPer
  } = await (async () => {
    if (parentId) {
      return await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        per: ReadPermissionVal,
        datasetId: parentId
      });
    }
    return {
      ...(await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: ReadPermissionVal
      })),
      dataset: undefined
    };
  })();

  const findDatasetQuery = (() => {
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};

    if (searchKey) {
      return {
        teamId,
        ...searchMatch
      };
    }

    return {
      teamId,
      ...(type ? (Array.isArray(type) ? { type: { $in: type } } : { type }) : {}),
      ...parseParentIdInMongo(parentId)
    };
  })();

  const myGroupIds = (
    await getGroupsByTmbId({
      tmbId,
      teamId
    })
  ).map((item) => String(item._id));

  const [myDatasets, perList] = await Promise.all([
    MongoDataset.find(findDatasetQuery)
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
      const { Per, privateDataset } = (() => {
        const myPerList = perList.filter(
          (item) =>
            String(item.tmbId) === String(tmbId) || myGroupIds.includes(String(item.groupId))
        );

        const getPer = (datasetId: string) => {
          const tmbPer = myPerList.find(
            (item) => String(item.resourceId) === datasetId && !!item.tmbId
          )?.permission;
          const groupPer = getGroupPer(
            myPerList
              .filter(
                (item) =>
                  String(item.resourceId) === datasetId && myGroupIds.includes(String(item.groupId))
              )
              .map((item) => item.permission)
          );

          const clbCount = perList.filter((item) => String(item.resourceId) === datasetId).length;

          return {
            Per: new DatasetPermission({
              per: tmbPer ?? groupPer ?? DatasetDefaultPermissionVal,
              isOwner: String(dataset.tmbId) === String(tmbId) || myPer.isOwner
            }),
            privateDataset: dataset.type === 'folder' ? clbCount <= 1 : clbCount === 0
          };
        };
        // inherit
        if (dataset.inheritPermission && parentDataset && dataset.type !== DatasetTypeEnum.folder) {
          return getPer(String(parentDataset._id));
        } else {
          return getPer(String(dataset._id));
        }
      })();

      return {
        ...dataset,
        permission: Per,
        privateDataset
      };
    })
    .filter((app) => app.permission.hasReadPer);

  const data = await Promise.all(
    filterDatasets.map<DatasetListItemType>((item) => ({
      _id: item._id,
      avatar: item.avatar,
      name: item.name,
      intro: item.intro,
      type: item.type,
      permission: item.permission,
      vectorModel: getVectorModel(item.vectorModel),
      inheritPermission: item.inheritPermission,
      tmbId: item.tmbId,
      updateTime: item.updateTime,
      private: item.privateDataset
    }))
  );

  return data;
}

export default NextAPI(handler);
