import type { NextApiRequest } from 'next';
import { Types } from '@fastgpt/service/common/mongo';
import type { DatasetCollectionsListItemType } from '@fastgpt/global/core/dataset/type';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  DatasetCollectionTypeEnum,
  DatasetTypeEnum,
  CollectionStatusEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ReadPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { type PaginationResponse } from '@fastgpt/global/openapi/api';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { type DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  MongoDatasetData,
  DatasetDataCollectionName
} from '@fastgpt/service/core/dataset/data/schema';
import {
  MongoDatasetTraining,
  DatasetTrainingCollectionName
} from '@fastgpt/service/core/dataset/training/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { addMinutes } from 'date-fns';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';

// 计算单个文件（非 folder）的状态
function getFileStatus(item: {
  dataAmount: number;
  trainingAmount: number;
  hasError?: boolean;
  tableSchemaExist?: boolean; // 数据库表是否存在（仅数据库类型知识库）
  hasActive?: boolean; // 是否有训练任务在近10分钟内被队列 worker 拉取（lockTime > now-10min）
  allParse?: boolean; // 是否所有训练记录都是 parse 模式（用于区分 parse 前排队 vs parse 后排队）
}): CollectionStatusEnum {
  // 不存在状态：数据库知识库的表被删除
  if (item.tableSchemaExist === false) {
    return CollectionStatusEnum.notExist;
  }
  if (item.hasError) {
    return CollectionStatusEnum.error;
  }
  if (item.trainingAmount > 0) {
    // 训练任务全部未被 worker 拉取 且 全部是 parse 模式 → 排队中（parse 之前）
    if (!item.hasActive && item.allParse) {
      return CollectionStatusEnum.queued;
    }
    // 全部是 parse 模式 且 有任务正在执行 → 解析中
    if (item.allParse) {
      return CollectionStatusEnum.parsing;
    }
    // 存在非 parse 模式任务（chunk/qa 等）→ 索引中
    return CollectionStatusEnum.indexing;
  }
  // 没有训练任务时，无论是否有数据，都表示训练已完成
  // - 有数据：正常完成
  // - 无数据：空文档（训练完成但无内容可提取）
  return CollectionStatusEnum.ready;
}

// 根据子文件状态列表计算 folder 的匹配状态集合（递归聚合模式）
// 返回 folder 下存在的所有状态类型的集合
function getFolderMatchingStatuses(
  childStatuses: CollectionStatusEnum[]
): Set<CollectionStatusEnum> {
  // 空 folder 默认匹配 ready 状态
  if (childStatuses.length === 0) {
    return new Set([CollectionStatusEnum.ready]);
  }

  // 收集所有子文件的状态类型（去重）
  return new Set(childStatuses);
}

// Collection 数据类型（用于缓存）
type CollectionCacheItem = {
  _id: string;
  parentId: string | null;
  type: string;
  tableSchema?: { exist?: boolean };
};

// 从预加载的 collection 列表中递归获取 folder 下所有子集合的 ID 和 tableSchema.exist 信息
function getChildCollectionIdsFromCache(
  allCollections: CollectionCacheItem[],
  parentId: string
): { id: Types.ObjectId; tableSchemaExist?: boolean }[] {
  function findDescendantFileIds(
    pid: string
  ): { id: Types.ObjectId; tableSchemaExist?: boolean }[] {
    const children = allCollections.filter((c) => String(c.parentId) === pid);
    const result: { id: Types.ObjectId; tableSchemaExist?: boolean }[] = [];
    for (const child of children) {
      if (child.type === DatasetCollectionTypeEnum.folder) {
        result.push(...findDescendantFileIds(String(child._id)));
      } else {
        result.push({
          id: new Types.ObjectId(String(child._id)),
          tableSchemaExist: child.tableSchema?.exist
        });
      }
    }
    return result;
  }

  return findDescendantFileIds(parentId);
}

// 预加载 dataset 下所有 collection 的基本信息（用于 folder 状态计算）
async function preloadAllCollections(
  teamId: Types.ObjectId,
  datasetId: Types.ObjectId
): Promise<CollectionCacheItem[]> {
  const collections = await MongoDatasetCollection.find(
    { teamId, datasetId, deleteTime: null },
    { _id: 1, parentId: 1, type: 1, 'tableSchema.exist': 1 }
  ).lean();

  return collections.map((c) => ({
    _id: String(c._id),
    parentId: c.parentId ? String(c.parentId) : null,
    type: c.type,
    tableSchema: c.tableSchema
  }));
}

// 计算 folder 的匹配状态集合（基于其下所有子文件的状态）
// 使用预加载的 collection 数据避免重复查询
async function computeFolderMatchingStatuses(
  teamId: Types.ObjectId,
  datasetId: Types.ObjectId,
  folderId: string,
  allCollectionsCache: CollectionCacheItem[]
): Promise<Set<CollectionStatusEnum>> {
  const childItems = getChildCollectionIdsFromCache(allCollectionsCache, folderId);

  if (childItems.length === 0) {
    return new Set([CollectionStatusEnum.ready]);
  }

  const childIds = childItems.map((item) => item.id);

  // 创建 tableSchemaExist 映射
  const tableSchemaExistMap = new Map<string, boolean | undefined>();
  childItems.forEach((item) => {
    tableSchemaExistMap.set(String(item.id), item.tableSchemaExist);
  });

  const [trainingResult, dataResult] = await Promise.all([
    MongoDatasetTraining.aggregate([
      {
        $match: {
          teamId,
          datasetId,
          collectionId: { $in: childIds }
        }
      },
      {
        $group: {
          _id: '$collectionId',
          count: { $sum: 1 },
          hasError: {
            $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] }
          },
          hasActive: { $max: { $gt: ['$lockTime', addMinutes(new Date(), -10)] } },
          allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
        }
      }
    ]),
    MongoDatasetData.aggregate([
      {
        $match: {
          teamId,
          datasetId,
          collectionId: { $in: childIds }
        }
      },
      {
        $group: {
          _id: '$collectionId',
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  type TrainingAggResult = {
    _id: string;
    count: number;
    hasError: boolean;
    hasActive: boolean;
    allParse: boolean;
  };
  type DataAggResult = { _id: string; count: number };

  const trainingMap = new Map<string, TrainingAggResult>(
    trainingResult.map((item: TrainingAggResult) => [String(item._id), item])
  );
  const dataMap = new Map<string, DataAggResult>(
    dataResult.map((item: DataAggResult) => [String(item._id), item])
  );

  const childStatuses: CollectionStatusEnum[] = childIds.map((id: Types.ObjectId) => {
    const idStr = String(id);
    const training = trainingMap.get(idStr);
    const data = dataMap.get(idStr);
    const tableSchemaExist = tableSchemaExistMap.get(idStr);

    return getFileStatus({
      dataAmount: data?.count || 0,
      trainingAmount: training?.count || 0,
      hasError: training?.hasError || false,
      hasActive: training?.hasActive || false,
      allParse: training?.allParse || false,
      tableSchemaExist
    });
  });

  return getFolderMatchingStatuses(childStatuses);
}

/**
 * 为列表中每个 collection 计算其真实权限（内存计算，参考 dataset/list.ts）：
 * - inheritPermission === false 或 folder 类型：从 myRoles 中获取自身权限
 * - inheritPermission !== false 且非 folder 类型：从 myRoles 中获取 parentId 的权限，并叠加自身权限
 *   （自身权限理论上应为空，但为兼容旧数据仍做叠加）
 */
function computeCollectionPermissions(
  items: Pick<
    DatasetCollectionSchemaType,
    '_id' | 'tmbId' | 'parentId' | 'inheritPermission' | 'type'
  >[],
  myRoles: any[],
  parentFolderPermission: DatasetPermission,
  tmbId: string
): Map<string, DatasetPermission> {
  const getPer = (resourceId: string, itemTmbId?: string) => {
    const tmbRole = myRoles.find(
      (item) => String(item.resourceId) === resourceId && !!item.tmbId
    )?.permission;
    const groupAndOrgRole = sumPer(
      ...myRoles
        .filter(
          (item) => String(item.resourceId) === resourceId && (!!item.groupId || !!item.orgId)
        )
        .map((item) => item.permission)
    );
    return new DatasetPermission({
      role: tmbRole ?? groupAndOrgRole,
      isOwner: itemTmbId !== undefined ? String(itemTmbId) === String(tmbId) : false
    });
  };

  const map = new Map<string, DatasetPermission>();
  for (const item of items) {
    const itemId = String(item._id);
    const isIndependent =
      item.inheritPermission === false || item.type === DatasetCollectionTypeEnum.folder;

    if (isIndependent) {
      map.set(itemId, getPer(itemId, item.tmbId));
    } else {
      // Inherited non-folder: permission comes from parent chain
      // parentId exists -> parent collection; null -> dataset root
      const parentPer = item.parentId
        ? getPer(String(item.parentId), item.tmbId)
        : parentFolderPermission;
      // Sum own clbs for backward compatibility (should be empty after upgrade)
      const selfPer = getPer(itemId, item.tmbId);
      map.set(
        itemId,
        new DatasetPermission({
          role: sumPer(parentPer.role, selfPer.role),
          isOwner: selfPer.isOwner
        })
      );
    }
  }
  return map;
}

async function handler(
  req: NextApiRequest
): Promise<PaginationResponse<DatasetCollectionsListItemType>> {
  let {
    datasetId,
    parentId = null,
    searchText = '',
    selectFolder = false,
    filterTags = [],
    simple = false,
    sortBy = 'updateTime',
    sortOrder = 'desc',
    status
  } = req.body as GetDatasetCollectionsProps;
  let { pageSize, offset } = parsePaginationRequest(req);
  pageSize = Math.min(pageSize, 100);
  searchText = searchText?.replace(/'/g, '');

  // 统一处理 status 为数组
  const statusFilter = status ? (Array.isArray(status) ? status : [status]) : undefined;

  // auth dataset or parent collection and get my role
  let teamId: string;
  let tmbId: string;
  let permission: DatasetPermission;
  if (parentId) {
    const result = await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId: parentId,
      per: ReadPermissionVal
    });
    teamId = result.teamId;
    tmbId = result.tmbId;
    permission = result.permission;
  } else {
    const result = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: ReadPermissionVal
    });
    teamId = result.teamId;
    tmbId = result.tmbId;
    permission = result.permission;
  }

  // Get dataset type to check if it's database or structureDocument
  const dataset = await MongoDataset.findById(datasetId).select('type').lean();
  const isDatabaseDataset = dataset?.type === DatasetTypeEnum.database;
  const isStructureDocument = dataset?.type === DatasetTypeEnum.structureDocument;

  // 团队所有者跳过 collection 级别权限过滤
  const { permission: tmbPermission } = await getTmbInfoByTmbId({ tmbId });
  const isTeamOwner = tmbPermission.isOwner;

  // 计算当前目录层级的父级权限：
  // - 根目录（parentId=null）：使用 dataset 权限
  // - 在某个 folder 内：获取该 folder 的真实权限
  let parentFolderPermission = permission;
  let myRoles: any[] = [];

  if (!isTeamOwner) {
    // 参考 dataset/list：获取所有 collection 权限数据
    const [roleList, myGroupMap, myOrgSet] = await Promise.all([
      MongoResourcePermission.find({
        resourceType: PerResourceTypeEnum.collection,
        teamId,
        resourceId: { $exists: true }
      }).lean(),
      getGroupsByTmbId({ tmbId, teamId }).then((items) => {
        const map = new Map<string, 1>();
        items.forEach((item) => map.set(String(item._id), 1));
        return map;
      }),
      getOrgIdSetWithParentByTmbId({ teamId, tmbId })
    ]);

    myRoles = roleList.filter(
      (item) =>
        String(item.tmbId) === String(tmbId) ||
        myGroupMap.has(String(item.groupId)) ||
        myOrgSet.has(String(item.orgId))
    );
  }

  const match = {
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId),
    deleteTime: null,
    ...(selectFolder ? { type: DatasetCollectionTypeEnum.folder } : {}),
    ...(searchText
      ? {
          $or: [
            { name: new RegExp(`${replaceRegChars(searchText)}`, 'i') },
            { 'tableSchema.description': new RegExp(`${replaceRegChars(searchText)}`, 'i') }
          ]
        }
      : {
          parentId: parentId ? new Types.ObjectId(parentId) : null
        }),
    ...(filterTags.length
      ? {
          $or: [{ tags: { $in: filterTags } }, { 'tags.tagId': { $in: filterTags } }]
        }
      : {})
  };

  const selectField = {
    _id: 1,
    parentId: 1,
    tmbId: 1,
    name: 1,
    type: 1,
    forbid: 1,
    createTime: 1,
    updateTime: 1,
    trainingType: 1,
    fileId: 1,
    rawLink: 1,
    tags: 1,
    externalFileId: 1,
    inheritPermission: 1,
    permissionEffectScope: 1,
    ...(isDatabaseDataset ? { tableSchema: 1 } : {}),
    ...(isStructureDocument ? { metadata: 1 } : {})
  };

  // not count data amount
  if (simple) {
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortOption: Record<string, 1 | -1> = { [sortBy]: sortDirection };

    let query = MongoDatasetCollection.find(match, undefined, {
      ...readFromSecondary
    })
      .select(selectField)
      .sort(sortOption);

    // 文件名排序时使用 collation（大小写不敏感、中文支持）
    if (sortBy === 'name') {
      query = query.collation({ locale: 'zh', strength: 2 });
    }

    // 团队所有者：数据库分页，跳过权限计算
    if (isTeamOwner) {
      query = query.skip(offset).limit(pageSize);
      const collections = await query.lean();

      return {
        list: await Promise.all(
          collections.map(async (item) => ({
            ...item,
            tags: await collectionTagsToTagLabel({
              datasetId,
              tags: item.tags
            }),
            dataAmount: 0,
            processedCount: 0,
            remainingCount: 0,
            indexAmount: 0,
            trainingAmount: 0,
            hasError: false,
            status:
              item.type === DatasetCollectionTypeEnum.folder
                ? CollectionStatusEnum.ready
                : CollectionStatusEnum.queued,
            permission,
            ...(isDatabaseDataset && item.tableSchema
              ? { tableSchemaDescription: item.tableSchema.description }
              : {}),
            ...(isStructureDocument && item.metadata
              ? { rows: item.metadata.rows, cols: item.metadata.cols }
              : {})
          }))
        ),
        total: await MongoDatasetCollection.countDocuments(match)
      };
    }

    // 非所有者：全量查询 + 内存权限过滤 + 内存分页
    const allCollections = await query.lean();

    // 计算权限并过滤
    const permissionsMap = computeCollectionPermissions(
      allCollections,
      myRoles,
      parentFolderPermission,
      tmbId
    );
    const filteredCollections = allCollections.filter(
      (item) => (permissionsMap.get(String(item._id)) ?? parentFolderPermission).hasReadPer
    );

    // 内存分页
    const total = filteredCollections.length;
    const paginatedCollections = filteredCollections.slice(offset, offset + pageSize);

    return {
      list: await Promise.all(
        paginatedCollections.map(async (item) => ({
          ...item,
          tags: await collectionTagsToTagLabel({
            datasetId,
            tags: item.tags
          }),
          dataAmount: 0,
          processedCount: 0,
          remainingCount: 0,
          indexAmount: 0,
          trainingAmount: 0,
          hasError: false,
          status:
            item.type === DatasetCollectionTypeEnum.folder
              ? CollectionStatusEnum.ready
              : CollectionStatusEnum.queued,
          permission: permissionsMap.get(String(item._id)) ?? parentFolderPermission,
          ...(isDatabaseDataset && item.tableSchema
            ? { tableSchemaDescription: item.tableSchema.description }
            : {}),
          ...(isStructureDocument && item.metadata
            ? { rows: item.metadata.rows, cols: item.metadata.cols }
            : {})
        }))
      ),
      total
    };
  }

  // 根据排序字段或状态筛选决定查询策略
  if (sortBy === 'dataAmount' || statusFilter) {
    // 需要聚合数据后再排序/筛选
    return await handleDataAmountSortOrStatusFilter({
      match,
      selectField,
      teamId,
      tmbId,
      datasetId,
      pageSize,
      offset,
      sortBy,
      sortOrder,
      statusFilter,
      parentFolderPermission,
      isDatabaseDataset,
      isStructureDocument,
      permission,
      myRoles,
      isTeamOwner
    });
  } else {
    // 按字段排序（name、createTime、updateTime）- 直接在数据库排序
    return await handleFieldSort({
      match,
      selectField,
      teamId,
      tmbId,
      datasetId,
      pageSize,
      offset,
      sortBy: sortBy as 'name' | 'updateTime' | 'createTime',
      sortOrder,
      parentFolderPermission,
      isDatabaseDataset,
      isStructureDocument,
      permission,
      myRoles,
      isTeamOwner
    });
  }
}

// 按字段排序的处理函数（支持 name、createTime、updateTime）
async function handleFieldSort({
  match,
  selectField,
  teamId,
  tmbId,
  datasetId,
  pageSize,
  offset,
  sortBy,
  sortOrder,
  parentFolderPermission,
  isDatabaseDataset,
  isStructureDocument,
  permission,
  myRoles,
  isTeamOwner
}: {
  match: any;
  selectField: any;
  teamId: string;
  tmbId: string;
  datasetId: string;
  pageSize: number;
  offset: number;
  sortBy: 'name' | 'updateTime' | 'createTime';
  sortOrder: 'asc' | 'desc';
  parentFolderPermission: DatasetPermission;
  isDatabaseDataset: boolean;
  isStructureDocument: boolean;
  permission: DatasetPermission;
  myRoles: any[];
  isTeamOwner: boolean;
}): Promise<PaginationResponse<DatasetCollectionsListItemType>> {
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  const sortOption: Record<string, 1 | -1> = { [sortBy]: sortDirection };

  // 团队所有者：数据库分页，跳过权限计算
  if (isTeamOwner) {
    let query = MongoDatasetCollection.find(match, undefined, { ...readFromSecondary })
      .select(selectField)
      .sort(sortOption)
      .skip(offset)
      .limit(pageSize);

    if (sortBy === 'name') {
      query = query.collation({ locale: 'zh', strength: 2 });
    }

    const paginatedCollections = await query.lean();
    const collectionIds = paginatedCollections.map((item) => new Types.ObjectId(item._id));

    // 聚合数据量（仅分页后的数据）
    const [trainingAmountResult, dataAmountResult]: [
      { _id: string; count: number; hasError: boolean; hasActive: boolean; allParse: boolean }[],
      { _id: string; count: number; processedCount: number; remainingCount: number }[]
    ] = await Promise.all([
      MongoDatasetTraining.aggregate(
        [
          {
            $match: {
              teamId: new Types.ObjectId(teamId),
              datasetId: new Types.ObjectId(datasetId),
              collectionId: { $in: collectionIds }
            }
          },
          {
            $group: {
              _id: '$collectionId',
              count: { $sum: 1 },
              hasError: {
                $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] }
              },
              hasActive: { $max: { $gt: ['$lockTime', addMinutes(new Date(), -10)] } },
              allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
            }
          }
        ],
        { ...readFromSecondary }
      ),
      MongoDatasetData.aggregate(
        [
          {
            $match: {
              teamId: new Types.ObjectId(teamId),
              datasetId: new Types.ObjectId(datasetId),
              collectionId: { $in: collectionIds }
            }
          },
          {
            $group: {
              _id: '$collectionId',
              count: { $sum: 1 },
              processedCount: {
                $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 1, 0] }
              },
              remainingCount: {
                $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 0, 1] }
              }
            }
          }
        ],
        { ...readFromSecondary }
      )
    ]);

    const trainingMap = new Map(trainingAmountResult.map((item) => [String(item._id), item]));
    const dataMap = new Map(dataAmountResult.map((item) => [String(item._id), item]));

    const folders = paginatedCollections.filter(
      (item) => item.type === DatasetCollectionTypeEnum.folder
    );

    const allCollectionsCache =
      folders.length > 0
        ? await preloadAllCollections(new Types.ObjectId(teamId), new Types.ObjectId(datasetId))
        : [];

    const folderMatchingStatusesPromise =
      folders.length > 0
        ? Promise.all(
            folders.map((folder) =>
              computeFolderMatchingStatuses(
                new Types.ObjectId(teamId),
                new Types.ObjectId(datasetId),
                String(folder._id),
                allCollectionsCache
              )
            )
          )
        : Promise.resolve([]);

    const [folderMatchingStatusesArray, tagResults] = await Promise.all([
      folderMatchingStatusesPromise,
      Promise.all(
        paginatedCollections.map((item) => collectionTagsToTagLabel({ datasetId, tags: item.tags }))
      )
    ]);

    const folderMatchingStatusesMap = new Map<string, Set<CollectionStatusEnum>>();
    folders.forEach((folder, index) => {
      folderMatchingStatusesMap.set(String(folder._id), folderMatchingStatusesArray[index]);
    });

    const list = paginatedCollections.map((item, index) => {
      const itemId = String(item._id);
      const training = trainingMap.get(itemId);
      const data = dataMap.get(itemId);

      const trainingAmount = training?.count || 0;
      const dataAmount = data?.count || 0;
      const processedCount = data?.processedCount || 0;
      const remainingCount = data?.remainingCount || 0;
      const hasError = training?.hasError || false;
      const hasActive = training?.hasActive || false;
      const allParse = training?.allParse || false;

      const isFolder = item.type === DatasetCollectionTypeEnum.folder;

      if (isFolder) {
        const matchingStatuses = folderMatchingStatusesMap.get(itemId)!;
        return {
          ...item,
          tags: tagResults[index] as any,
          trainingAmount,
          dataAmount,
          processedCount,
          remainingCount,
          hasError,
          matchingStatuses: Array.from(matchingStatuses),
          permission,
          ...(isDatabaseDataset && item.tableSchema
            ? { tableSchemaDescription: item.tableSchema.description }
            : {}),
          ...(isStructureDocument && item.metadata
            ? { rows: item.metadata.rows, cols: item.metadata.cols }
            : {})
        };
      } else {
        const fileStatus = getFileStatus({
          dataAmount,
          trainingAmount,
          hasError,
          hasActive,
          allParse,
          tableSchemaExist: item.tableSchema?.exist
        });
        return {
          ...item,
          tags: tagResults[index] as any,
          trainingAmount,
          dataAmount,
          processedCount,
          remainingCount,
          hasError,
          status: fileStatus,
          permission,
          ...(isDatabaseDataset && item.tableSchema
            ? { tableSchemaDescription: item.tableSchema.description }
            : {}),
          ...(isStructureDocument && item.metadata
            ? { rows: item.metadata.rows, cols: item.metadata.cols }
            : {})
        };
      }
    });

    return { list, total: await MongoDatasetCollection.countDocuments(match) };
  }

  // 1. 全量查询（不加 skip/limit）
  let query = MongoDatasetCollection.find(match, undefined, { ...readFromSecondary })
    .select(selectField)
    .sort(sortOption);

  // 文件名排序时使用 collation
  if (sortBy === 'name') {
    query = query.collation({ locale: 'zh', strength: 2 });
  }

  const allCollections = await query.lean();

  // 2. 计算权限并过滤
  const permissionsMap = computeCollectionPermissions(
    allCollections,
    myRoles,
    parentFolderPermission,
    tmbId
  );
  const filteredCollections = allCollections.filter(
    (item) => (permissionsMap.get(String(item._id)) ?? parentFolderPermission).hasReadPer
  );

  // 3. 内存分页
  const total = filteredCollections.length;
  const paginatedCollections = filteredCollections.slice(offset, offset + pageSize);
  const collectionIds = paginatedCollections.map((item) => new Types.ObjectId(item._id));

  // 4. 聚合数据量（仅分页后的数据）
  const [trainingAmountResult, dataAmountResult]: [
    { _id: string; count: number; hasError: boolean; hasActive: boolean; allParse: boolean }[],
    { _id: string; count: number; processedCount: number; remainingCount: number }[]
  ] = await Promise.all([
    MongoDatasetTraining.aggregate(
      [
        {
          $match: {
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            collectionId: { $in: collectionIds }
          }
        },
        {
          $group: {
            _id: '$collectionId',
            count: { $sum: 1 },
            hasError: {
              $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] }
            },
            hasActive: { $max: { $gt: ['$lockTime', addMinutes(new Date(), -10)] } },
            allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
          }
        }
      ],
      { ...readFromSecondary }
    ),
    MongoDatasetData.aggregate(
      [
        {
          $match: {
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            collectionId: { $in: collectionIds }
          }
        },
        {
          $group: {
            _id: '$collectionId',
            count: { $sum: 1 },
            processedCount: {
              $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 1, 0] }
            },
            remainingCount: {
              $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 0, 1] }
            }
          }
        }
      ],
      { ...readFromSecondary }
    )
  ]);

  // 使用 Map 优化查找效率 O(1)
  const trainingMap = new Map(trainingAmountResult.map((item) => [String(item._id), item]));
  const dataMap = new Map(dataAmountResult.map((item) => [String(item._id), item]));

  // 分离 folder 和非 folder，并行计算所有 folder 的匹配状态集合
  const folders = paginatedCollections.filter(
    (item) => item.type === DatasetCollectionTypeEnum.folder
  );

  // 预加载所有 collection 数据（仅在有 folder 时执行，避免重复查询）
  const allCollectionsCache =
    folders.length > 0
      ? await preloadAllCollections(new Types.ObjectId(teamId), new Types.ObjectId(datasetId))
      : [];

  // 并行计算所有 folder 的匹配状态集合
  const folderMatchingStatusesPromise =
    folders.length > 0
      ? Promise.all(
          folders.map((folder) =>
            computeFolderMatchingStatuses(
              new Types.ObjectId(teamId),
              new Types.ObjectId(datasetId),
              String(folder._id),
              allCollectionsCache
            )
          )
        )
      : Promise.resolve([]);

  // 同时并行处理 tags
  const [folderMatchingStatusesArray, tagResults] = await Promise.all([
    folderMatchingStatusesPromise,
    Promise.all(
      paginatedCollections.map((item) => collectionTagsToTagLabel({ datasetId, tags: item.tags }))
    )
  ]);

  // 创建 folder 匹配状态映射
  const folderMatchingStatusesMap = new Map<string, Set<CollectionStatusEnum>>();
  folders.forEach((folder, index) => {
    folderMatchingStatusesMap.set(String(folder._id), folderMatchingStatusesArray[index]);
  });

  // 组装最终结果
  const list = paginatedCollections.map((item, index) => {
    const itemId = String(item._id);
    const training = trainingMap.get(itemId);
    const data = dataMap.get(itemId);

    const trainingAmount = training?.count || 0;
    const dataAmount = data?.count || 0;
    const processedCount = data?.processedCount || 0;
    const remainingCount = data?.remainingCount || 0;
    const hasError = training?.hasError || false;
    const hasActive = training?.hasActive || false;
    const allParse = training?.allParse || false;
    const itemPermission = permissionsMap.get(itemId) ?? parentFolderPermission;

    const isFolder = item.type === DatasetCollectionTypeEnum.folder;

    // folder 返回 matchingStatuses 数组，文件返回 status 字段
    if (isFolder) {
      const matchingStatuses = folderMatchingStatusesMap.get(itemId)!;
      return {
        ...item,
        tags: tagResults[index] as any,
        trainingAmount,
        dataAmount,
        processedCount,
        remainingCount,
        hasError,
        matchingStatuses: Array.from(matchingStatuses),
        permission: itemPermission,
        ...(isDatabaseDataset && item.tableSchema
          ? { tableSchemaDescription: item.tableSchema.description }
          : {}),
        ...(isStructureDocument && item.metadata
          ? { rows: item.metadata.rows, cols: item.metadata.cols }
          : {})
      };
    } else {
      const fileStatus = getFileStatus({
        dataAmount,
        trainingAmount,
        hasError,
        hasActive,
        allParse,
        tableSchemaExist: item.tableSchema?.exist
      });
      return {
        ...item,
        tags: tagResults[index] as any,
        trainingAmount,
        dataAmount,
        processedCount,
        remainingCount,
        hasError,
        status: fileStatus,
        permission: itemPermission,
        ...(isDatabaseDataset && item.tableSchema
          ? { tableSchemaDescription: item.tableSchema.description }
          : {}),
        ...(isStructureDocument && item.metadata
          ? { rows: item.metadata.rows, cols: item.metadata.cols }
          : {})
      };
    }
  });

  return { list, total };
}

// 按分块数排序或状态筛选的处理函数
// - 有状态筛选时：使用内存分页（保证分页准确性，因为 folder 状态需要递归计算）
// - 无状态筛选时：使用数据库聚合管道分页（提高性能）
async function handleDataAmountSortOrStatusFilter({
  match,
  selectField,
  teamId,
  tmbId,
  datasetId,
  pageSize,
  offset,
  sortBy,
  sortOrder,
  statusFilter,
  parentFolderPermission,
  isDatabaseDataset,
  isStructureDocument,
  permission,
  myRoles,
  isTeamOwner
}: {
  match: any;
  selectField: any;
  teamId: string;
  tmbId: string;
  datasetId: string;
  pageSize: number;
  offset: number;
  sortBy: 'name' | 'updateTime' | 'createTime' | 'dataAmount';
  sortOrder: 'asc' | 'desc';
  statusFilter: CollectionStatusEnum[] | undefined;
  parentFolderPermission: DatasetPermission;
  isDatabaseDataset: boolean;
  isStructureDocument: boolean;
  permission: DatasetPermission;
  myRoles: any[];
  isTeamOwner: boolean;
}): Promise<PaginationResponse<DatasetCollectionsListItemType>> {
  const teamIdObj = new Types.ObjectId(teamId);
  const datasetIdObj = new Types.ObjectId(datasetId);
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  // 有状态筛选时，使用内存分页保证准确性
  if (statusFilter && statusFilter.length > 0) {
    return handleStatusFilterWithMemoryPagination({
      match,
      teamId,
      tmbId,
      datasetId,
      pageSize,
      offset,
      sortBy,
      sortOrder,
      statusFilter,
      parentFolderPermission,
      isDatabaseDataset,
      isStructureDocument,
      permission,
      myRoles,
      isTeamOwner
    });
  }

  // 无状态筛选时，使用数据库聚合管道获取全量数据，再内存过滤分页
  const basePipeline: any[] = [
    { $match: match },

    // 左连接 dataset_training 表
    {
      $lookup: {
        from: DatasetTrainingCollectionName,
        let: { collectionId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$collectionId', '$$collectionId'] },
                  { $eq: ['$teamId', teamIdObj] },
                  { $eq: ['$datasetId', datasetIdObj] }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              hasError: {
                $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] }
              },
              hasActive: { $max: { $gt: ['$lockTime', addMinutes(new Date(), -10)] } },
              allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
            }
          }
        ],
        as: 'trainingInfo'
      }
    },

    // 左连接 dataset_datas 表
    {
      $lookup: {
        from: DatasetDataCollectionName,
        let: { collectionId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$collectionId', '$$collectionId'] },
                  { $eq: ['$teamId', teamIdObj] },
                  { $eq: ['$datasetId', datasetIdObj] }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              processedCount: {
                $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 1, 0] }
              },
              remainingCount: {
                $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 0, 1] }
              }
            }
          }
        ],
        as: 'dataInfo'
      }
    },

    // 计算字段
    {
      $addFields: {
        trainingAmount: { $ifNull: [{ $arrayElemAt: ['$trainingInfo.count', 0] }, 0] },
        dataAmount: { $ifNull: [{ $arrayElemAt: ['$dataInfo.count', 0] }, 0] },
        processedCount: { $ifNull: [{ $arrayElemAt: ['$dataInfo.processedCount', 0] }, 0] },
        remainingCount: { $ifNull: [{ $arrayElemAt: ['$dataInfo.remainingCount', 0] }, 0] },
        hasError: { $ifNull: [{ $arrayElemAt: ['$trainingInfo.hasError', 0] }, false] },
        hasActive: { $ifNull: [{ $arrayElemAt: ['$trainingInfo.hasActive', 0] }, false] },
        allParse: { $ifNull: [{ $arrayElemAt: ['$trainingInfo.allParse', 0] }, false] }
      }
    },

    // 计算状态
    {
      $addFields: {
        status: {
          $cond: {
            if: { $eq: ['$type', DatasetCollectionTypeEnum.folder] },
            then: CollectionStatusEnum.ready,
            else: {
              $cond: {
                if: { $eq: ['$tableSchema.exist', false] },
                then: CollectionStatusEnum.notExist,
                else: {
                  $cond: {
                    if: { $eq: ['$hasError', true] },
                    then: CollectionStatusEnum.error,
                    else: {
                      $cond: {
                        if: { $gt: ['$trainingAmount', 0] },
                        then: {
                          $cond: {
                            if: {
                              $and: [{ $eq: ['$hasActive', false] }, { $eq: ['$allParse', true] }]
                            },
                            then: CollectionStatusEnum.queued,
                            else: {
                              $cond: {
                                if: { $eq: ['$allParse', true] },
                                then: CollectionStatusEnum.parsing,
                                else: CollectionStatusEnum.indexing
                              }
                            }
                          }
                        },
                        else: CollectionStatusEnum.ready
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    // 移除临时字段
    { $project: { trainingInfo: 0, dataInfo: 0 } }
  ];

  // 排序
  if (sortBy === 'dataAmount') {
    basePipeline.push({
      $addFields: {
        sortOrder: {
          $cond: { if: { $eq: ['$type', DatasetCollectionTypeEnum.folder] }, then: 1, else: 0 }
        }
      }
    });
    basePipeline.push({ $sort: { sortOrder: 1, dataAmount: sortDirection, updateTime: -1 } });
    basePipeline.push({ $project: { sortOrder: 0 } });
  } else {
    basePipeline.push({ $sort: { [sortBy]: sortDirection } });
  }

  // 聚合获取全量数据
  const collections = await MongoDatasetCollection.aggregate(basePipeline, {
    ...readFromSecondary
  });

  // 计算权限并过滤
  let permissionsMap = new Map<string, DatasetPermission>();
  let filteredCollections = collections;
  if (!isTeamOwner) {
    permissionsMap = computeCollectionPermissions(
      collections,
      myRoles,
      parentFolderPermission,
      tmbId
    );
    filteredCollections = collections.filter(
      (item: any) => (permissionsMap.get(String(item._id)) ?? parentFolderPermission).hasReadPer
    );
  }

  // 内存分页
  const total = filteredCollections.length;
  const paginatedCollections = filteredCollections.slice(offset, offset + pageSize);

  // 处理 folder 匹配状态集合
  const folders = paginatedCollections.filter(
    (item: any) => item.type === DatasetCollectionTypeEnum.folder
  );
  const folderMatchingStatusesMap = new Map<string, Set<CollectionStatusEnum>>();

  if (folders.length > 0) {
    const allCollectionsCache = await preloadAllCollections(teamIdObj, datasetIdObj);
    const folderMatchingStatusesArray = await Promise.all(
      folders.map((folder: any) =>
        computeFolderMatchingStatuses(
          teamIdObj,
          datasetIdObj,
          String(folder._id),
          allCollectionsCache
        )
      )
    );
    folders.forEach((folder: any, index: number) => {
      folderMatchingStatusesMap.set(String(folder._id), folderMatchingStatusesArray[index]);
    });
  }

  // 组装结果
  const list = await Promise.all(
    paginatedCollections.map(async (item: any) => {
      const isFolder = item.type === DatasetCollectionTypeEnum.folder;
      const itemPermission = permissionsMap.get(String(item._id)) ?? parentFolderPermission;

      // folder 返回 matchingStatuses 数组，文件返回 status 字段
      if (isFolder) {
        const matchingStatuses =
          folderMatchingStatusesMap.get(String(item._id)) || new Set([CollectionStatusEnum.ready]);
        return {
          ...item,
          tags: await collectionTagsToTagLabel({ datasetId, tags: item.tags }),
          matchingStatuses: Array.from(matchingStatuses),
          permission: isTeamOwner ? permission : itemPermission,
          ...(isDatabaseDataset && item.tableSchema
            ? { tableSchemaDescription: item.tableSchema.description }
            : {}),
          ...(isStructureDocument && item.metadata
            ? { rows: item.metadata.rows, cols: item.metadata.cols }
            : {})
        };
      } else {
        return {
          ...item,
          tags: await collectionTagsToTagLabel({ datasetId, tags: item.tags }),
          status: item.status,
          permission: isTeamOwner ? permission : itemPermission,
          ...(isDatabaseDataset && item.tableSchema
            ? { tableSchemaDescription: item.tableSchema.description }
            : {}),
          ...(isStructureDocument && item.metadata
            ? { rows: item.metadata.rows, cols: item.metadata.cols }
            : {})
        };
      }
    })
  );

  return { list, total };
}

// 有状态筛选时的内存分页处理（保证分页准确性）
async function handleStatusFilterWithMemoryPagination({
  match,
  teamId,
  tmbId,
  datasetId,
  pageSize,
  offset,
  sortBy,
  sortOrder,
  statusFilter,
  parentFolderPermission,
  isDatabaseDataset,
  isStructureDocument,
  permission,
  myRoles,
  isTeamOwner
}: {
  match: any;
  teamId: string;
  tmbId: string;
  datasetId: string;
  pageSize: number;
  offset: number;
  sortBy: 'name' | 'updateTime' | 'createTime' | 'dataAmount';
  sortOrder: 'asc' | 'desc';
  statusFilter: CollectionStatusEnum[];
  parentFolderPermission: DatasetPermission;
  isDatabaseDataset: boolean;
  isStructureDocument: boolean;
  permission: DatasetPermission;
  myRoles: any[];
  isTeamOwner: boolean;
}): Promise<PaginationResponse<DatasetCollectionsListItemType>> {
  const teamIdObj = new Types.ObjectId(teamId);
  const datasetIdObj = new Types.ObjectId(datasetId);

  // 获取所有匹配的 collection
  const allCollections = await MongoDatasetCollection.find(match, undefined, {
    ...readFromSecondary
  }).lean();

  const allCollectionIds = allCollections.map((item) => new Types.ObjectId(String(item._id)));

  // 聚合数据量
  const [trainingAmount, dataAmount] = await Promise.all([
    MongoDatasetTraining.aggregate<{
      _id: string;
      count: number;
      hasError: boolean;
      hasActive: boolean;
      allParse: boolean;
    }>(
      [
        {
          $match: {
            teamId: teamIdObj,
            datasetId: datasetIdObj,
            collectionId: { $in: allCollectionIds }
          }
        },
        {
          $group: {
            _id: '$collectionId',
            count: { $sum: 1 },
            hasError: {
              $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] }
            },
            hasActive: { $max: { $gt: ['$lockTime', addMinutes(new Date(), -10)] } },
            allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
          }
        }
      ],
      { ...readFromSecondary }
    ),
    MongoDatasetData.aggregate<{
      _id: string;
      count: number;
      processedCount: number;
      remainingCount: number;
    }>(
      [
        {
          $match: {
            teamId: teamIdObj,
            datasetId: datasetIdObj,
            collectionId: { $in: allCollectionIds }
          }
        },
        {
          $group: {
            _id: '$collectionId',
            count: { $sum: 1 },
            processedCount: {
              $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 1, 0] }
            },
            remainingCount: {
              $sum: { $cond: [{ $ifNull: ['$indexingCompleteTime', false] }, 0, 1] }
            }
          }
        }
      ],
      { ...readFromSecondary }
    )
  ]);

  const trainingMap = new Map(trainingAmount.map((item) => [String(item._id), item]));
  const dataMap = new Map(dataAmount.map((item) => [String(item._id), item]));

  // 计算 folder 匹配状态集合
  const folders = allCollections.filter((item) => item.type === DatasetCollectionTypeEnum.folder);
  const allCollectionsCache =
    folders.length > 0 ? await preloadAllCollections(teamIdObj, datasetIdObj) : [];

  const folderMatchingStatusesArray =
    folders.length > 0
      ? await Promise.all(
          folders.map((folder) =>
            computeFolderMatchingStatuses(
              teamIdObj,
              datasetIdObj,
              String(folder._id),
              allCollectionsCache
            )
          )
        )
      : [];

  const folderMatchingStatusesMap = new Map<string, Set<CollectionStatusEnum>>();
  folders.forEach((folder, index) => {
    folderMatchingStatusesMap.set(String(folder._id), folderMatchingStatusesArray[index]);
  });

  // 组合数据并计算状态
  const collectionsWithData = allCollections.map((item) => {
    const itemId = String(item._id);
    const training = trainingMap.get(itemId);
    const data = dataMap.get(itemId);

    const trainingAmountVal = training?.count || 0;
    const dataAmountVal = data?.count || 0;
    const processedCountVal = data?.processedCount || 0;
    const remainingCountVal = data?.remainingCount || 0;
    const hasErrorVal = training?.hasError || false;
    const hasActiveVal = training?.hasActive || false;
    const allParseVal = training?.allParse || false;

    const isFolder = item.type === DatasetCollectionTypeEnum.folder;

    // folder 使用匹配状态集合，文件使用单一状态
    if (isFolder) {
      const matchingStatuses = folderMatchingStatusesMap.get(itemId)!;
      return {
        ...item,
        trainingAmount: trainingAmountVal,
        dataAmount: dataAmountVal,
        processedCount: processedCountVal,
        remainingCount: remainingCountVal,
        hasError: hasErrorVal,
        matchingStatuses
      };
    } else {
      const fileStatus = getFileStatus({
        dataAmount: dataAmountVal,
        trainingAmount: trainingAmountVal,
        hasError: hasErrorVal,
        hasActive: hasActiveVal,
        allParse: allParseVal,
        tableSchemaExist: item.tableSchema?.exist
      });
      return {
        ...item,
        trainingAmount: trainingAmountVal,
        dataAmount: dataAmountVal,
        processedCount: processedCountVal,
        remainingCount: remainingCountVal,
        hasError: hasErrorVal,
        status: fileStatus
      };
    }
  });

  // 计算权限并过滤（非 owner）
  let permissionFilteredCollections = collectionsWithData;
  const permissionsMap = new Map<string, DatasetPermission>();
  if (!isTeamOwner) {
    const computedMap = computeCollectionPermissions(
      collectionsWithData,
      myRoles,
      parentFolderPermission,
      tmbId
    );
    computedMap.forEach((v, k) => permissionsMap.set(k, v));
    permissionFilteredCollections = collectionsWithData.filter(
      (item) => (permissionsMap.get(String(item._id)) ?? parentFolderPermission).hasReadPer
    );
  }

  // 状态筛选：使用 Set 交集判断
  const filteredCollections = permissionFilteredCollections.filter((item) => {
    const isFolder = item.type === DatasetCollectionTypeEnum.folder;
    if (isFolder) {
      // folder: 检查 matchingStatuses 集合是否与筛选条件有交集
      return statusFilter.some((status) => (item as any).matchingStatuses.has(status));
    } else {
      // 文件: 直接检查 status 是否在筛选条件中
      return statusFilter.includes((item as any).status);
    }
  });

  // 排序
  if (sortBy === 'dataAmount') {
    const sortFolders = filteredCollections.filter(
      (item) => item.type === DatasetCollectionTypeEnum.folder
    );
    const sortFiles = filteredCollections.filter(
      (item) => item.type !== DatasetCollectionTypeEnum.folder
    );

    sortFiles.sort((a, b) =>
      sortOrder === 'asc' ? a.dataAmount - b.dataAmount : b.dataAmount - a.dataAmount
    );
    sortFolders.sort((a, b) => new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime());

    filteredCollections.length = 0;
    filteredCollections.push(...sortFiles, ...sortFolders);
  } else {
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    filteredCollections.sort((a, b) => {
      const aValue = a[sortBy as keyof typeof a];
      const bValue = b[sortBy as keyof typeof b];

      if (sortBy === 'name') {
        return (
          sortDirection *
          (aValue as string).localeCompare(bValue as string, 'zh', { sensitivity: 'base' })
        );
      }
      return (
        sortDirection *
        (new Date(aValue as string).getTime() - new Date(bValue as string).getTime())
      );
    });
  }

  // 分页
  const total = filteredCollections.length;
  const paginatedCollections = filteredCollections.slice(offset, offset + pageSize);

  // 组装结果
  const list = await Promise.all(
    paginatedCollections.map(async (item) => {
      const isFolder = item.type === DatasetCollectionTypeEnum.folder;
      const itemPermission = isTeamOwner
        ? permission
        : permissionsMap.get(String(item._id)) ?? parentFolderPermission;

      // folder 返回 matchingStatuses 数组，文件返回 status 字段
      if (isFolder) {
        const matchingStatuses =
          folderMatchingStatusesMap.get(String(item._id)) || new Set([CollectionStatusEnum.ready]);
        return {
          ...item,
          tags: await collectionTagsToTagLabel({ datasetId, tags: item.tags }),
          matchingStatuses: Array.from(matchingStatuses),
          permission: itemPermission,
          ...(isDatabaseDataset && item.tableSchema
            ? { tableSchemaDescription: item.tableSchema.description }
            : {}),
          ...(isStructureDocument && item.metadata
            ? { rows: item.metadata.rows, cols: item.metadata.cols }
            : {})
        };
      } else {
        return {
          ...item,
          tags: await collectionTagsToTagLabel({ datasetId, tags: item.tags }),
          permission: itemPermission,
          ...(isDatabaseDataset && item.tableSchema
            ? { tableSchemaDescription: item.tableSchema.description }
            : {}),
          ...(isStructureDocument && item.metadata
            ? { rows: item.metadata.rows, cols: item.metadata.cols }
            : {})
        };
      }
    })
  );

  return { list: list as DatasetCollectionsListItemType[], total };
}

export default NextAPI(handler);
