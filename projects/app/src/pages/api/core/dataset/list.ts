import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type.d';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { sumPer } from '@fastgpt/global/support/permission/utils';

export type GetDatasetListBody = {
  parentId: ParentIdType;
  type?: DatasetTypeEnum;
  searchKey?: string;
  scene?: string;
  pageNum?: number;
  pageSize?: number;
};

type ListDatasetResponse = DatasetListItemType[] | { list: DatasetListItemType[]; total: number };

async function handler(req: ApiRequestProps<GetDatasetListBody>): Promise<ListDatasetResponse> {
  const { parentId, type, searchKey, scene, pageNum, pageSize } = req.body;
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

  // 分页参数最大值限制
  const MAX_PAGE_SIZE = 100;
  const safePageSize = isPaginated ? Math.min(pageSize, MAX_PAGE_SIZE) : undefined;

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

  // 分页模式：使用数据库级分页 + countDocuments 获取准确的 total
  // 非分页模式：保留全量查询（用于无限滚动等场景）

  const baseQuery = findDatasetQuery;

  // 分页模式下并行执行 count 和分页查询
  const [total, myDatasets] = isPaginated
    ? await Promise.all([
        MongoDataset.countDocuments(baseQuery),
        MongoDataset.find(baseQuery)
          .sort({ updateTime: -1 })
          .skip((pageNum! - 1) * safePageSize!)
          .limit(safePageSize!)
          .lean()
      ])
    : [0, await MongoDataset.find(baseQuery).sort({ updateTime: -1 }).lean()];

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
        tmbId: dataset.tmbId,
        updateTime: dataset.updateTime,
        permission: Per,
        private: privateDataset,
        ...(scene !== undefined &&
          dataCountMap && { dataCount: dataCountMap.get(String(dataset._id)) || 0 }) // dataCount used by evaluation scene
      };
    })
    .filter((app) => app.permission.hasReadPer);

  const result = await addSourceMember({
    list: formatDatasets
  });

  if (isPaginated) return { list: result, total };
  return result;
}

export default NextAPI(handler);
