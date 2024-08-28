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
    permission: tmbPer
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

  const [myDatasets, rpList] = await Promise.all([
    MongoDataset.find(findDatasetQuery)
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
      const Per = (() => {
        if (dataset.inheritPermission && parentDataset && dataset.type !== DatasetTypeEnum.folder) {
          dataset.defaultPermission = parentDataset.defaultPermission;
          const perVal = rpList.find(
            (item) => String(item.resourceId) === String(parentDataset._id)
          )?.permission;
          return new DatasetPermission({
            per: perVal ?? parentDataset.defaultPermission,
            isOwner: String(parentDataset.tmbId) === tmbId || tmbPer.isOwner
          });
        } else {
          const perVal = rpList.find(
            (item) => String(item.resourceId) === String(dataset._id)
          )?.permission;
          return new DatasetPermission({
            per: perVal ?? dataset.defaultPermission,
            isOwner: String(dataset.tmbId) === tmbId || tmbPer.isOwner
          });
        }
      })();
      return {
        ...dataset,
        permission: Per
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
      defaultPermission: item.defaultPermission ?? DatasetDefaultPermissionVal,
      inheritPermission: item.inheritPermission,
      tmbId: item.tmbId,
      updateTime: item.updateTime
    }))
  );

  return data;
}

export default NextAPI(handler);
