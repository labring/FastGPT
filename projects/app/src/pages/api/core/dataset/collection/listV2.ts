import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManageRoleVal,
  NullRoleVal,
  OwnerRoleVal,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { getDescendantFolderIds } from '@fastgpt/global/common/parentFolder/subtree';
import { buildCollectionListTagMatch } from '@fastgpt/service/core/dataset/collection/tagFilter';
import {
  type DatasetCollectionSchemaType,
  type CollectionTagLabelType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  getCollectionTrainingStatusFromCounts,
  getCollectionTrainingModeCountsPipeline,
  type CollectionTrainingModeCount
} from '@fastgpt/service/core/dataset/training/query';
import {
  datasetDataRebuildStatusCountFields,
  type DatasetDataRebuildStatusCounts
} from '@fastgpt/service/core/dataset/data/query';
import {
  ListCollectionV2BodySchema,
  ListCollectionV2ResponseSchema,
  type ListCollectionV2ResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  canShortCircuitCollectionPermission,
  getCollectionPermissionMap,
  getReadableCollectionIds
} from '@fastgpt/service/support/permission/collection/auth';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { CollectionPermission } from '@fastgpt/global/support/permission/collection/controller';

const defaultCollectionTrainingStatus = getCollectionTrainingStatusFromCounts({});

type TrainingAmountAggregateItem = {
  _id: string;
  modeCounts: CollectionTrainingModeCount[];
};

/**
 * 列表范围谓词。
 * - 浏览（无搜索词）：只看直接子级，逐层导航。
 * - 搜索：当前路径自身 + 其下整个子树内的文件夹（不含祖先、不含路径外内容）；根目录即全库。
 * 权限候选集查询与主查询共用本函数，避免两处谓词再次分叉。
 */
const parseCollectionScopeMatch = ({
  parentId,
  searchText,
  subtreeFolderIds
}: {
  parentId?: string | null;
  searchText?: string;
  subtreeFolderIds: string[];
}) => {
  if (!searchText) {
    return { parentId: parentId ? new Types.ObjectId(parentId) : null };
  }

  const nameMatch = { name: new RegExp(`${replaceRegChars(searchText)}`, 'i') };

  // 根目录：范围就是整个 dataset，不需要枚举子树
  if (!parentId) return nameMatch;

  return {
    ...nameMatch,
    parentId: {
      $in: [new Types.ObjectId(parentId), ...subtreeFolderIds.map((id) => new Types.ObjectId(id))]
    }
  };
};

/** 层序遍历的安全上限：脏树（环 / 超深）不得拖垮请求。 */
const maxSubtreeDepth = 20;
/** 层序遍历累计访问的文件夹数上限，用于约束搜索谓词里 `$in` 数组的长度。 */
const maxSubtreeNodes = 20000;
const subtreeLogger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

/**
 * 收集 collectionId 子树内全部**文件夹** ID（不含自身）。
 *
 * 一次性把该知识库的全部文件夹读进内存（只投影 `_id parentId`），按 parentId 分桶后层序下行，
 * 因此恒定 1 次查询、延迟不随子树规模变化；代价是无论搜在哪都要扫全库文件夹。
 * 与 findCollectionAndChild 的区别：后者是逐节点串行递归（每节点一次查询、不区分文件与文件夹），
 * 服务删除这类低 QPS 场景没问题；本函数服务搜索范围这类交互热路径。
 * 通用遍历见 global/common/parentFolder/subtree.ts。
 *
 * 触达上限时返回已收集的部分（调用方须接受搜索范围可能不完整）。
 */
const findSubtreeFolderIds = async ({
  teamId,
  datasetId,
  collectionId
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
}): Promise<string[]> => {
  const folders = await MongoDatasetCollection.find(
    {
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId),
      type: DatasetCollectionTypeEnum.folder
    },
    '_id parentId',
    { ...readFromSecondary }
  ).lean();

  // 按 parentId 分桶。根级文件夹（parentId 为空）不会成为「谁的子级」的查询键，跳过。
  const childrenByParent = new Map<string, string[]>();
  for (const folder of folders) {
    const parentKey = folder.parentId ? String(folder.parentId) : '';
    if (!parentKey) continue;
    const children = childrenByParent.get(parentKey);
    if (children) children.push(String(folder._id));
    else childrenByParent.set(parentKey, [String(folder._id)]);
  }

  const { ids, truncated } = await getDescendantFolderIds({
    rootIds: [collectionId],
    maxDepth: maxSubtreeDepth,
    maxNodes: maxSubtreeNodes,
    findChildFolders: async (folderIds) => folderIds.flatMap((id) => childrenByParent.get(id) ?? [])
  });

  if (truncated) {
    subtreeLogger.warn(
      `[findSubtreeFolderIds] traversal truncated, search scope may miss deeper folders: datasetId=${datasetId} collectionId=${collectionId} collected=${ids.length}`
    );
  }

  return ids;
};

async function handler(req: ApiRequestProps): Promise<ListCollectionV2ResponseType> {
  const {
    datasetId,
    parentId,
    searchText: rawSearchText,
    selectFolder,
    tagFilters,
    simple,
    pageSize: rawPageSize,
    offset: rawOffset,
    pageNum: rawPageNum
  } = parseApiInput({ req, bodySchema: ListCollectionV2BodySchema }).body;
  const pageSize = Math.min(Number(rawPageSize ?? 10), 100);
  const offset =
    rawOffset !== undefined ? Number(rawOffset) : (Number(rawPageNum ?? 1) - 1) * pageSize;
  const searchText = rawSearchText?.replace(/'/g, '');

  // auth dataset and get my role
  const { teamId, tmbId, permission, isRoot, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  // 搜索范围限定在当前路径及其子树，先枚举子树内的文件夹 ID（根目录搜索无需枚举）。
  const subtreeFolderIds =
    searchText && parentId
      ? await findSubtreeFolderIds({ teamId, datasetId, collectionId: parentId })
      : [];
  const scopeMatch = parseCollectionScopeMatch({ parentId, searchText, subtreeFolderIds });

  // 浏览具体目录前先校验目录本身可读；搜索模式不校验 —— 范围由 parentId 子树决定，
  // 命中项各自还要过权限过滤，父目录本身是否可读不影响结果正确性。
  if (parentId && !searchText) {
    const { collection: parentCollection } = await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId: parentId,
      per: ReadPermissionVal
    });
    if (String(parentCollection.datasetId) !== String(datasetId)) {
      return Promise.reject(DatasetErrEnum.unAuthDatasetCollection);
    }
  }

  // Collection 级可见性过滤：团队 owner 或纯继承短路时跳过；
  // 否则以当前目录候选集合 `$in` 限定批量解析可读 ID（无 N+1）。
  let collectionIdFilter = {};
  let groupIds: string[] = [];
  let orgIds: string[] = [];
  // 复用同一次 tmb 查询：短路判定与逐 Collection 返回权限都依赖是否团队 owner。
  const tmbInfo = await getTmbInfoByTmbId({ tmbId });
  const isTeamOwner = String(tmbInfo.teamId) === String(teamId) && tmbInfo.permission.isOwner;
  const shortCircuitCollectionPermission = await canShortCircuitCollectionPermission({
    teamId,
    datasetIds: [datasetId],
    tmbId,
    tmbInfo
  });
  if (!shortCircuitCollectionPermission) {
    const candidates = await MongoDatasetCollection.find(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId),
        ...(selectFolder ? { type: DatasetCollectionTypeEnum.folder } : {}),
        ...scopeMatch,
        ...buildCollectionListTagMatch(tagFilters)
      },
      '_id type parentId tmbId inheritPermission datasetId',
      { ...readFromSecondary }
    ).lean();

    [groupIds, orgIds] = await Promise.all([
      getGroupsByTmbId({ tmbId, teamId }).then((list) => list.map((item) => String(item._id))),
      getOrgIdSetWithParentByTmbId({ tmbId, teamId }).then((set) => Array.from(set))
    ]);
    const readableIds = await getReadableCollectionIds({
      collections: candidates,
      tmbId,
      teamId,
      groupIds,
      orgIds,
      datasetPermission: permission.role,
      collectionPermissionEnabled: dataset.collectionPermissionEnabled
    });
    collectionIdFilter =
      readableIds.length > 0
        ? { _id: { $in: readableIds.map((id) => new Types.ObjectId(id)) } }
        : { _id: { $in: [] } };
  }

  const match = {
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId),
    ...(selectFolder ? { type: DatasetCollectionTypeEnum.folder } : {}),
    ...scopeMatch,
    ...buildCollectionListTagMatch(tagFilters),
    ...collectionIdFilter
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
    externalFileId: 1
  };

  /** 分页后批量读取逐 Collection 权限，避免权限查询随 Dataset 集合总量增长。 */
  const loadCollectionPermissionMap = async (collections: DatasetCollectionSchemaType[]) => {
    if (shortCircuitCollectionPermission) return undefined;

    const roleMap = await getCollectionPermissionMap({
      collections,
      tmbId,
      teamId,
      groupIds,
      orgIds
    });
    return new Map(
      collections.map((item) => [
        String(item._id),
        new CollectionPermission({
          role: roleMap.get(String(item._id)) ?? NullRoleVal,
          isOwner: String(item.tmbId) === tmbId
        })
      ])
    );
  };

  /** 返回与详情鉴权一致的逐 Collection 权限；短路分支无需读取 ACL。 */
  const getCollectionPermission = (
    item: Pick<DatasetCollectionSchemaType, '_id' | 'tmbId'>,
    collectionPermissionMap?: Map<string, CollectionPermission>
  ) => {
    if (isRoot) return new CollectionPermission({ isOwner: true });

    const resolvedPermission = collectionPermissionMap?.get(String(item._id));
    if (resolvedPermission) return resolvedPermission;

    return new CollectionPermission({
      // 团队 owner 与详情鉴权一致返回 owner；dataset owner 的父级权限不透传，cap 为 manage。
      role: permission.role === OwnerRoleVal ? ManageRoleVal : permission.role,
      isOwner: isTeamOwner || String(item.tmbId) === tmbId
    });
  };

  // not count data amount
  if (simple) {
    const [collections, total]: [DatasetCollectionSchemaType[], number] = await Promise.all([
      MongoDatasetCollection.find(match, undefined, { ...readFromSecondary })
        .select(selectField)
        .sort({ updateTime: -1 })
        .skip(offset)
        .limit(pageSize)
        .lean(),
      MongoDatasetCollection.countDocuments(match)
    ]);
    const [collectionPermissionMap, tags] = await Promise.all([
      loadCollectionPermissionMap(collections),
      Promise.all(
        collections.map((item) => collectionTagsToTagLabel({ datasetId, tags: item.tags }))
      )
    ]);

    return ListCollectionV2ResponseSchema.parse({
      list: collections.map((item, index) => ({
        ...item,
        tags: tags[index],
        dataAmount: 0,
        ...defaultCollectionTrainingStatus,
        permission: getCollectionPermission(item, collectionPermissionMap)
      })),
      total
    });
  }

  const [collections, total]: [DatasetCollectionSchemaType[], number] = await Promise.all([
    MongoDatasetCollection.find(match, undefined, { ...readFromSecondary })
      .select(selectField)
      .sort({ updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDatasetCollection.countDocuments(match, { ...readFromSecondary })
  ]);
  const collectionIds = collections.map((item) => new Types.ObjectId(item._id));

  // Compute data amount
  const [trainingAmount, dataAmount, collectionPermissionMap, tags]: [
    TrainingAmountAggregateItem[],
    (DatasetDataRebuildStatusCounts & { _id: string; count: number })[],
    Map<string, CollectionPermission> | undefined,
    (CollectionTagLabelType[] | undefined)[]
  ] = await Promise.all([
    MongoDatasetTraining.aggregate(
      getCollectionTrainingModeCountsPipeline({
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId),
        collectionId: { $in: collectionIds }
      }),
      readFromSecondary
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
            ...datasetDataRebuildStatusCountFields
          }
        }
      ],
      {
        ...readFromSecondary
      }
    ),
    loadCollectionPermissionMap(collections),
    Promise.all(collections.map((item) => collectionTagsToTagLabel({ datasetId, tags: item.tags })))
  ]);

  const trainingAmountMap = new Map(trainingAmount.map((item) => [String(item._id), item]));
  const dataAmountMap = new Map(dataAmount.map((item) => [String(item._id), item]));
  const list = collections.map((item, index) => {
    const collectionId = String(item._id);
    const dataCounts = dataAmountMap.get(collectionId);
    return {
      ...item,
      tags: tags[index],
      dataAmount: dataCounts?.count ?? 0,
      ...getCollectionTrainingStatusFromCounts({
        modeCounts: trainingAmountMap.get(collectionId)?.modeCounts,
        rebuildCounts: dataCounts
      }),
      permission: getCollectionPermission(item, collectionPermissionMap)
    };
  });

  // count collections
  return ListCollectionV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
