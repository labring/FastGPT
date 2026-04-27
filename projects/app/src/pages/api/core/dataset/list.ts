import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from 'mongoose';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import {
  GetDatasetListBodySchema,
  type GetDatasetListResponse
} from '@fastgpt/global/openapi/core/dataset/api';

export type GetDatasetListBody = {
  parentId: string | null;
  type?: DatasetTypeEnum;
  searchKey?: string;
  scene?: string;
  pageNum?: number;
  pageSize?: number;
};

async function handler(req: ApiRequestProps) {
  const { parentId, type, searchKey } = GetDatasetListBodySchema.parse(req.body);
  const { scene, pageNum, pageSize } = req.body as GetDatasetListBody;
  const isPaginated = pageNum !== undefined && pageSize !== undefined;

  // 分页参数边界验证
  if (isPaginated) {
    if (pageNum < 1 || !Number.isInteger(pageNum)) {
      throw new Error('pageNum must be a positive integer');
    }
    if (pageSize < 1 || !Number.isInteger(pageSize)) {
      throw new Error('pageSize must be a positive integer');
    }
  }

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

  // Get team all permissions
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
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
    }),
    getOrgIdSetWithParentByTmbId({
      teamId,
      tmbId
    })
  ]);
  const myRoles = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const findDatasetQuery = (() => {
    // Filter apps by permission, if not owner, only get apps that I have permission to access
    const idList = { _id: { $in: myRoles.map((item) => item.resourceId) } };
    const datasetPerQuery = teamPer.isOwner
      ? {}
      : parentId
        ? {
            $or: [idList, parseParentIdInMongo(parentId)]
          }
        : { $or: [idList, { parentId: null }] };

    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};

    if (searchKey) {
      const data = {
        ...datasetPerQuery,
        teamId,
        deleteTime: null, // 搜索时也要过滤已删除数据
        ...searchMatch
      };
      // @ts-ignore
      delete data.parentId;
      return data;
    }

    return {
      ...datasetPerQuery,
      teamId,
      deleteTime: null, // 关键：只返回未删除的数据
      ...(type ? (Array.isArray(type) ? { type: { $in: type } } : { type }) : {}),
      ...parseParentIdInMongo(parentId)
    };
  })();

  const myDatasets = await MongoDataset.find(findDatasetQuery).sort({ updateTime: -1 }).lean();

  let dataCountMap: Map<string, number> | undefined;
  if (scene !== undefined) {
    // Count data that conforms to QA structure
    // Only count data with q field
    // 注意：分页模式下只统计当前页的数据，非分页模式下统计全量
    const dataCountsPromises = myDatasets.map((dataset) =>
      MongoDatasetData.countDocuments({
        teamId,
        datasetId: dataset._id,
        $or: [{ q: { $exists: true } }]
      })
    );

    const dataCounts = await Promise.all(dataCountsPromises);
    dataCountMap = new Map<string, number>();
    myDatasets.forEach((dataset, index) => {
      dataCountMap!.set(String(dataset._id), dataCounts[index]);
    });
  }

  // For non-folder datasets, count appCount and fileCount
  const nonFolderDatasets = myDatasets.filter((d) => d.type !== DatasetTypeEnum.folder);
  const appCountMap = new Map<string, number>();
  const fileCountMap = new Map<string, number>();
  if (nonFolderDatasets.length > 0) {
    const datasetIdStrings = nonFolderDatasets.map((d) => String(d._id));
    const datasetIdSet = new Set(datasetIdStrings);
    // find() post-hook converts _id to string, so we need to re-wrap for aggregate $in
    const datasetObjectIds = datasetIdStrings.map((id) => new Types.ObjectId(id));

    const [fileAgg, apps] = await Promise.all([
      // fileCount: 单次聚合替代 N 次 countDocuments
      MongoDatasetCollection.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            datasetId: { $in: datasetObjectIds },
            type: { $ne: DatasetCollectionTypeEnum.folder },
            deleteTime: null
          }
        },
        { $group: { _id: { $toString: '$datasetId' }, count: { $sum: 1 } } }
      ]),
      // appCount: 单次查询，仅投影必要字段，应用侧统计
      MongoApp.find(
        {
          teamId,
          modules: {
            $elemMatch: {
              inputs: {
                $elemMatch: {
                  key: 'datasets',
                  'value.datasetId': { $in: datasetIdStrings }
                }
              }
            }
          }
        },
        { _id: 1, 'modules.inputs': 1 }
      ).lean()
    ]);

    for (const item of fileAgg) {
      fileCountMap.set(String(item._id), item.count);
    }

    // 应用侧用 Set 对 appId 去重，确保同一 App 引用同一数据集多次只计 1 次
    const appIdSetMap = new Map<string, Set<string>>();
    for (const app of apps) {
      for (const mod of (app.modules as any[]) ?? []) {
        for (const input of (mod.inputs as any[]) ?? []) {
          if (input.key === 'datasets' && Array.isArray(input.value)) {
            for (const item of input.value as { datasetId: string }[]) {
              if (datasetIdSet.has(item.datasetId)) {
                if (!appIdSetMap.has(item.datasetId)) {
                  appIdSetMap.set(item.datasetId, new Set());
                }
                appIdSetMap.get(item.datasetId)!.add(String(app._id));
              }
            }
          }
        }
      }
    }
    for (const [datasetId, appIdSet] of appIdSetMap) {
      appCountMap.set(datasetId, appIdSet.size);
    }
  }

  const formatDatasets = myDatasets
    .map((dataset) => {
      const { Per, privateDataset } = (() => {
        const getPer = (datasetId: string) => {
          const tmbRole = myRoles.find(
            (item) => String(item.resourceId) === datasetId && !!item.tmbId
          )?.permission;
          const groupAndOrgRole = sumPer(
            ...myRoles
              .filter(
                (item) => String(item.resourceId) === datasetId && (!!item.groupId || !!item.orgId)
              )
              .map((item) => item.permission)
          );
          return new DatasetPermission({
            role: tmbRole ?? groupAndOrgRole,
            isOwner: String(dataset.tmbId) === String(tmbId) || teamPer.isOwner
          });
        };
        const getClbCount = (datasetId: string) => {
          return roleList.filter((item) => String(item.resourceId) === String(datasetId)).length;
        };

        // inherit
        if (
          dataset.inheritPermission &&
          dataset.parentId &&
          dataset.type !== DatasetTypeEnum.folder
        ) {
          // Inherited non-folder: permission = parent + own (own should be empty after upgrade)
          return {
            Per: getPer(String(dataset.parentId)).addRole(getPer(String(dataset._id)).role),
            privateDataset: getClbCount(String(dataset.parentId)) <= 1
          };
        }
        return {
          Per: getPer(String(dataset._id)),
          privateDataset: getClbCount(String(dataset._id)) <= 1
        };
      })();

      return {
        _id: dataset._id,
        avatar: dataset.avatar,
        name: dataset.name,
        intro: dataset.intro,
        type: dataset.type,
        vectorModel:
          dataset.type !== DatasetTypeEnum.structureDocument
            ? getEmbeddingModel(dataset.vectorModel)
            : undefined,
        inheritPermission: dataset.inheritPermission,
        permissionEffectScope: dataset.permissionEffectScope,
        tmbId: dataset.tmbId,
        updateTime: dataset.updateTime,
        permission: Per,
        private: privateDataset,
        ...(scene !== undefined &&
          dataCountMap && { dataCount: dataCountMap.get(String(dataset._id)) || 0 }), // dataCount used by evaluation scene
        ...(dataset.type !== DatasetTypeEnum.folder && {
          appCount: appCountMap.get(String(dataset._id)) ?? 0,
          fileCount: fileCountMap.get(String(dataset._id)) ?? 0
        })
      };
    })
    .filter((app) => app.permission.hasReadPer);

  const result = await addSourceMember({
    list: formatDatasets
  });

  if (isPaginated) {
    const total = result.length;
    const start = (pageNum! - 1) * pageSize!;
    const list = result.slice(start, start + pageSize!);
    return { list, total };
  }
  return result;
}

export default NextAPI(handler);
