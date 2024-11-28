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

  // Auth user permission
  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    }),
    ...(parentId
      ? [
          authDataset({
            req,
            authToken: true,
            authApiKey: true,
            per: ReadPermissionVal,
            datasetId: parentId
          })
        ]
      : [])
  ]);

  // Get team all app permissions
  const [perList, myGroupMap] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      resourceId: {
        $exists: true
      }
    }).lean(),
    getGroupsByTmbId({
      tmbId,
      teamId
    }).then((item) => {
      const map = new Map<string, 1>();
      item.forEach((item) => {
        map.set(String(item._id), 1);
      });
      return map;
    })
  ]);
  const myPerList = perList.filter(
    (item) => String(item.tmbId) === String(tmbId) || myGroupMap.has(String(item.groupId))
  );

  const findDatasetQuery = (() => {
    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};
    // Filter apps by permission, if not owner, only get apps that I have permission to access
    const appIdQuery = teamPer.isOwner
      ? {}
      : { _id: { $in: myPerList.map((item) => item.resourceId) } };

    if (searchKey) {
      return {
        ...appIdQuery,
        teamId,
        ...searchMatch
      };
    }

    return {
      ...appIdQuery,
      teamId,
      ...(type ? (Array.isArray(type) ? { type: { $in: type } } : { type }) : {}),
      ...parseParentIdInMongo(parentId)
    };
  })();

  const myDatasets = await MongoDataset.find(findDatasetQuery)
    .sort({
      updateTime: -1
    })
    .lean();

  const formatDatasets = myDatasets
    .map((dataset) => {
      const { Per, privateDataset } = (() => {
        const getPer = (datasetId: string) => {
          const tmbPer = myPerList.find(
            (item) => String(item.resourceId) === datasetId && !!item.tmbId
          )?.permission;
          const groupPer = getGroupPer(
            myPerList
              .filter((item) => String(item.resourceId) === datasetId && !!item.groupId)
              .map((item) => item.permission)
          );

          const clbCount = perList.filter((item) => String(item.resourceId) === datasetId).length;

          return {
            Per: new DatasetPermission({
              per: tmbPer ?? groupPer ?? DatasetDefaultPermissionVal,
              isOwner: String(dataset.tmbId) === String(tmbId) || teamPer.isOwner
            }),
            privateDataset: dataset.type === 'folder' ? clbCount <= 1 : clbCount === 0
          };
        };
        // inherit
        if (dataset.inheritPermission && parentId && dataset.type !== DatasetTypeEnum.folder) {
          return getPer(String(parentId));
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
    formatDatasets.map<DatasetListItemType>((item) => ({
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
