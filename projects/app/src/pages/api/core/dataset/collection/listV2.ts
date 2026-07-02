import type { NextApiRequest } from 'next';
import { Types } from '@fastgpt/service/common/mongo';
import type { DatasetCollectionsListItemType } from '@fastgpt/global/core/dataset/type';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  DatasetCollectionTypeEnum,
  DatasetTypeEnum,
  CollectionStatusEnum
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
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';

// 计算单个文件（非 folder）的状态
export function getFileStatus(item: {
  dataAmount: number;
  trainingAmount: number;
  hasError?: boolean;
  errorCount?: number;
  tableSchemaExist?: boolean; // 数据库表是否存在（仅数据库类型知识库）
  allParse?: boolean; // 是否所有训练记录都是 parse 模式（用于区分 parse 前排队 vs parse 后排队）
  parseStartTime?: Date; // 持久化标记：parse 任务创建时设置，用于判断处理是否已启动
  statsUpdatedAt?: Date; // stats 上次计算时间，undefined 表示尚未初始化
  processedCount?: number; // 已处理的数据条数
}): CollectionStatusEnum {
  // 不存在状态：数据库知识库的表被删除
  if (item.tableSchemaExist === false) {
    return CollectionStatusEnum.notExist;
  }
  // stats 尚未被 worker 初始化（新创建的 collection），默认为排队中
  if (!item.statsUpdatedAt) {
    return CollectionStatusEnum.queued;
  }
  // 只有全部数据都出错时，状态才为 error（errorCount 存在且等于 dataAmount）
  if (
    item.errorCount != null &&
    item.errorCount > 0 &&
    (item.errorCount === item.dataAmount || item.dataAmount === 0)
  ) {
    return CollectionStatusEnum.error;
  }
  if (item.trainingAmount > 0) {
    // parseStartTime 是持久化标记，在 Worker 首次拉取任务时通过 { $exists: false } 原子设置。
    // 一旦设置就不会因训练记录 deleteOne 而丢失，因此无需再依赖 hasActive 瞬态聚合值。
    if (item.allParse && !item.parseStartTime) {
      return CollectionStatusEnum.queued;
    }
    // 全部是 parse 模式 → 解析中（parseStartTime 已设置，或 worker 正在活跃处理）
    if (item.allParse) {
      return CollectionStatusEnum.parsing;
    }
    // 存在非 parse 模式任务（chunk/qa 等）→ 索引中
    return CollectionStatusEnum.indexing;
  }
  // 没有训练任务时，检查是否还有未处理的数据
  // 例如：同义词上传后 trainingAmount=0 但 processedCount 尚未恢复
  if (item.dataAmount > 0 && (item.processedCount ?? 0) < item.dataAmount) {
    return (item.processedCount ?? 0) === 0
      ? CollectionStatusEnum.queued // 尚未开始
      : CollectionStatusEnum.indexing; // 处理中断/进行中
  }
  // 有数据：正常完成 | 无数据：空文档（训练完成但无内容可提取）
  return CollectionStatusEnum.ready;
}

// 从 training 表实时统计每个 collection 的终态错误数（retryCount<=0 + errorMsg，与 detail 接口口径一致）
export async function getErrorCountMap(
  teamId: string,
  datasetId: string,
  collectionIds: (Types.ObjectId | string)[]
): Promise<Map<string, number>> {
  if (collectionIds.length === 0) return new Map();

  const result = await MongoDatasetTraining.aggregate(
    [
      {
        $match: {
          teamId: new Types.ObjectId(teamId),
          datasetId: new Types.ObjectId(datasetId),
          collectionId: {
            $in: collectionIds.map((id) => new Types.ObjectId(id))
          },
          errorMsg: { $exists: true },
          retryCount: { $lte: 0 }
        }
      },
      {
        $group: {
          _id: '$collectionId',
          count: { $sum: 1 }
        }
      }
    ],
    { ...readFromSecondary }
  );

  const map = new Map<string, number>();
  (result as any[]).forEach((item) => map.set(String(item._id), item.count));
  return map;
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
    parseStartTime: 1,
    dataAmount: 1,
    trainingAmount: 1,
    processedCount: 1,
    remainingCount: 1,
    hasError: 1,
    errorCount: 1,
    allParse: 1,
    statsUpdatedAt: 1,
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
            errorCount: 0,
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
          errorCount: 0,
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

    const errorCountMap = await getErrorCountMap(
      teamId,
      datasetId,
      paginatedCollections.map((item) => item._id)
    );

    // 从预计算字段构建 training/data Map
    const trainingMap = new Map(
      paginatedCollections.map((item) => [
        String(item._id),
        {
          count: item.trainingAmount || 0,
          hasError: item.hasError || false,
          errorCount: errorCountMap.get(String(item._id)) || 0,
          allParse: item.allParse ?? false
        }
      ])
    );
    const dataMap = new Map(
      paginatedCollections.map((item) => [
        String(item._id),
        {
          count: item.dataAmount || 0,
          processedCount: item.processedCount || 0,
          remainingCount: item.remainingCount || 0
        }
      ])
    );

    const tagResults = await Promise.all(
      paginatedCollections.map((item) => collectionTagsToTagLabel({ datasetId, tags: item.tags }))
    );

    const list = paginatedCollections.map((item, index) => {
      const itemId = String(item._id);
      const training = trainingMap.get(itemId);
      const data = dataMap.get(itemId);

      const trainingAmount = training?.count || 0;
      const dataAmount = data?.count || 0;
      const processedCount = data?.processedCount || 0;
      const remainingCount = data?.remainingCount || 0;
      const hasError = training?.hasError || false;
      const errorCount = training?.errorCount || 0;
      const allParse = training?.allParse || false;

      const isFolder = item.type === DatasetCollectionTypeEnum.folder;

      if (isFolder) {
        return {
          ...item,
          tags: tagResults[index] as any,
          trainingAmount,
          dataAmount,
          processedCount,
          remainingCount,
          hasError,
          errorCount,
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
          errorCount,
          allParse,
          parseStartTime: item.parseStartTime,
          tableSchemaExist: item.tableSchema?.exist,
          statsUpdatedAt: item.statsUpdatedAt,
          processedCount
        });
        return {
          ...item,
          tags: tagResults[index] as any,
          trainingAmount,
          dataAmount,
          processedCount,
          remainingCount,
          hasError,
          errorCount,
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

  const errorCountMap = await getErrorCountMap(
    teamId,
    datasetId,
    paginatedCollections.map((item) => item._id)
  );

  // 从预计算字段构建 training/data Map
  const trainingMap = new Map(
    paginatedCollections.map((item) => [
      String(item._id),
      {
        count: item.trainingAmount || 0,
        hasError: item.hasError || false,
        errorCount: errorCountMap.get(String(item._id)) || 0,
        allParse: item.allParse ?? false
      }
    ])
  );
  const dataMap = new Map(
    paginatedCollections.map((item) => [
      String(item._id),
      {
        count: item.dataAmount || 0,
        processedCount: item.processedCount || 0,
        remainingCount: item.remainingCount || 0
      }
    ])
  );

  // 同时并行处理 tags
  const tagResults = await Promise.all(
    paginatedCollections.map((item) => collectionTagsToTagLabel({ datasetId, tags: item.tags }))
  );

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
    const errorCount = training?.errorCount || 0;
    const allParse = training?.allParse || false;
    const itemPermission = permissionsMap.get(itemId) ?? parentFolderPermission;

    const isFolder = item.type === DatasetCollectionTypeEnum.folder;

    if (isFolder) {
      return {
        ...item,
        tags: tagResults[index] as any,
        trainingAmount,
        dataAmount,
        processedCount,
        remainingCount,
        hasError,
        errorCount,
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
        errorCount,
        allParse,
        parseStartTime: item.parseStartTime,
        tableSchemaExist: item.tableSchema?.exist,
        statsUpdatedAt: item.statsUpdatedAt,
        processedCount
      });
      return {
        ...item,
        tags: tagResults[index] as any,
        trainingAmount,
        dataAmount,
        processedCount,
        remainingCount,
        hasError,
        errorCount,
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

  // 无状态筛选时，直接从 collection 字段读取预计算的 stats（无需 $lookup 聚合）
  const basePipeline: any[] = [{ $match: match }];

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

  const errorCountMap = await getErrorCountMap(
    teamId,
    datasetId,
    paginatedCollections.map((item: any) => item._id)
  );

  // 组装结果
  const list = await Promise.all(
    paginatedCollections.map(async (item: any) => {
      const isFolder = item.type === DatasetCollectionTypeEnum.folder;
      const itemPermission = permissionsMap.get(String(item._id)) ?? parentFolderPermission;
      const errorCount = errorCountMap.get(String(item._id)) || 0;

      if (isFolder) {
        return {
          ...item,
          tags: await collectionTagsToTagLabel({ datasetId, tags: item.tags }),
          permission: isTeamOwner ? permission : itemPermission,
          ...(isDatabaseDataset && item.tableSchema
            ? { tableSchemaDescription: item.tableSchema.description }
            : {}),
          ...(isStructureDocument && item.metadata
            ? { rows: item.metadata.rows, cols: item.metadata.cols }
            : {})
        };
      } else {
        const fileStatus = getFileStatus({
          dataAmount: item.dataAmount || 0,
          trainingAmount: item.trainingAmount || 0,
          hasError: item.hasError || false,
          errorCount,
          allParse: item.allParse ?? false,
          parseStartTime: item.parseStartTime,
          tableSchemaExist: item.tableSchema?.exist,
          statsUpdatedAt: item.statsUpdatedAt,
          processedCount: item.processedCount || 0
        });
        return {
          ...item,
          errorCount,
          tags: await collectionTagsToTagLabel({ datasetId, tags: item.tags }),
          status: fileStatus,
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

  const errorCountMap = await getErrorCountMap(
    teamId,
    datasetId,
    allCollections.map((item) => item._id)
  );

  // 从预计算字段构建 training/data Map
  const trainingMap = new Map(
    allCollections.map((item) => [
      String(item._id),
      {
        count: item.trainingAmount || 0,
        hasError: item.hasError || false,
        errorCount: errorCountMap.get(String(item._id)) || 0,
        allParse: item.allParse ?? false
      }
    ])
  );
  const dataMap = new Map(
    allCollections.map((item) => [
      String(item._id),
      {
        count: item.dataAmount || 0,
        processedCount: item.processedCount || 0,
        remainingCount: item.remainingCount || 0
      }
    ])
  );

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
    const errorCountVal = training?.errorCount || 0;
    const allParseVal = training?.allParse || false;

    const isFolder = item.type === DatasetCollectionTypeEnum.folder;

    if (isFolder) {
      return {
        ...item,
        trainingAmount: trainingAmountVal,
        dataAmount: dataAmountVal,
        processedCount: processedCountVal,
        remainingCount: remainingCountVal,
        hasError: hasErrorVal,
        errorCount: errorCountVal
      };
    } else {
      const fileStatus = getFileStatus({
        dataAmount: dataAmountVal,
        trainingAmount: trainingAmountVal,
        hasError: hasErrorVal,
        errorCount: errorCountVal,
        allParse: allParseVal,
        parseStartTime: item.parseStartTime,
        tableSchemaExist: item.tableSchema?.exist,
        statsUpdatedAt: item.statsUpdatedAt,
        processedCount: processedCountVal
      });
      return {
        ...item,
        trainingAmount: trainingAmountVal,
        dataAmount: dataAmountVal,
        processedCount: processedCountVal,
        remainingCount: remainingCountVal,
        hasError: hasErrorVal,
        errorCount: errorCountVal,
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

  // 状态筛选：folder 无法精确匹配（无 matchingStatuses），统一排除
  const filteredCollections = permissionFilteredCollections.filter((item) => {
    const isFolder = item.type === DatasetCollectionTypeEnum.folder;
    if (isFolder) {
      return false;
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

      if (isFolder) {
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
