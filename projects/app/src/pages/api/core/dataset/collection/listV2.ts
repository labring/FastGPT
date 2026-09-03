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
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { type DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  activeTrainingExpr,
  finalErrorTrainingExpr,
  getSlowestTrainingStatus,
  remainingTrainingMatch,
  trainingModeRanks
} from '@fastgpt/service/core/dataset/training/query';
import {
  CollectionTrainingStatusEnum,
  type TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
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
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { CollectionPermission } from '@fastgpt/global/support/permission/collection/controller';

const defaultCollectionTrainingStatus = {
  trainingAmount: 0,
  activeTrainingAmount: 0,
  finalErrorAmount: 0,
  hasError: false,
  slowestTrainingStatus: CollectionTrainingStatusEnum.ready
};

type TrainingAmountAggregateItem = {
  _id: string;
  trainingAmount: number;
  activeTrainingAmount: number;
  finalErrorAmount: number;
  modeCounts: {
    mode: TrainingModeEnum;
    activeCount: number;
    finalErrorCount: number;
  }[];
};

const formatTrainingStatus = (item?: TrainingAmountAggregateItem) => {
  if (!item) return defaultCollectionTrainingStatus;

  const { slowestTrainingMode, slowestTrainingStatus } = getSlowestTrainingStatus(
    Object.fromEntries(
      item.modeCounts.map(({ mode, activeCount, finalErrorCount }) => [
        mode,
        { activeCount, finalErrorCount }
      ])
    )
  );

  return {
    trainingAmount: item.trainingAmount,
    activeTrainingAmount: item.activeTrainingAmount,
    finalErrorAmount: item.finalErrorAmount,
    hasError: item.finalErrorAmount > 0,
    slowestTrainingMode,
    slowestTrainingStatus
  };
};

async function handler(req: ApiRequestProps): Promise<ListCollectionV2ResponseType> {
  const {
    datasetId,
    parentId,
    searchText: rawSearchText,
    selectFolder,
    filterTags,
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

  // 浏览具体目录前先校验目录本身可读；搜索模式（searchText）忽略 parentId 过滤，无需校验。
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

  // Collection 级可见性过滤：团队 owner/admin 或纯继承短路时跳过；
  // 否则以当前目录候选集合 `$in` 限定批量解析可读 ID（无 N+1）。
  let collectionIdFilter = {};
  let groupIds: string[] = [];
  let orgIds: string[] = [];
  const shortCircuitCollectionPermission = await canShortCircuitCollectionPermission({
    teamId,
    datasetIds: [datasetId],
    tmbId
  });
  if (!shortCircuitCollectionPermission) {
    const candidates = await MongoDatasetCollection.find(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId),
        ...(selectFolder ? { type: DatasetCollectionTypeEnum.folder } : {}),
        ...(searchText
          ? {
              name: new RegExp(`${replaceRegChars(searchText)}`, 'i')
            }
          : {
              parentId: parentId ? new Types.ObjectId(parentId) : null
            }),
        ...(filterTags.length ? { tags: { $in: filterTags } } : {})
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
      hasSetCollectionPermissions: dataset.hasSetCollectionPermissions
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
    ...(searchText
      ? {
          name: new RegExp(`${replaceRegChars(searchText)}`, 'i')
        }
      : {
          parentId: parentId ? new Types.ObjectId(parentId) : null
        }),
    ...(filterTags.length ? { tags: { $in: filterTags } } : {}),
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
      role: permission.role === OwnerRoleVal ? ManageRoleVal : permission.role,
      isOwner: String(item.tmbId) === tmbId
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
    { _id: string; count: number }[],
    Map<string, CollectionPermission> | undefined,
    (string[] | undefined)[]
  ] = await Promise.all([
    MongoDatasetTraining.aggregate(
      [
        {
          $match: {
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            collectionId: { $in: collectionIds },
            ...remainingTrainingMatch
          }
        },
        {
          $addFields: {
            modeRank: {
              $switch: {
                branches: trainingModeRanks.map(({ mode, rank }) => ({
                  case: { $eq: ['$mode', mode] },
                  then: rank
                })),
                default: 999
              }
            },
            isActiveTraining: activeTrainingExpr,
            isFinalErrorTraining: finalErrorTrainingExpr
          }
        },
        {
          $group: {
            _id: '$collectionId',
            trainingAmount: { $sum: 1 },
            activeTrainingAmount: { $sum: { $cond: ['$isActiveTraining', 1, 0] } },
            finalErrorAmount: { $sum: { $cond: ['$isFinalErrorTraining', 1, 0] } },
            modeCounts: {
              $push: {
                mode: '$mode',
                modeRank: '$modeRank',
                activeCount: { $cond: ['$isActiveTraining', 1, 0] },
                finalErrorCount: { $cond: ['$isFinalErrorTraining', 1, 0] }
              }
            }
          }
        },
        { $unwind: '$modeCounts' },
        {
          $group: {
            _id: {
              collectionId: '$_id',
              mode: '$modeCounts.mode',
              modeRank: '$modeCounts.modeRank'
            },
            trainingAmount: { $first: '$trainingAmount' },
            activeTrainingAmount: { $first: '$activeTrainingAmount' },
            finalErrorAmount: { $first: '$finalErrorAmount' },
            activeCount: { $sum: '$modeCounts.activeCount' },
            finalErrorCount: { $sum: '$modeCounts.finalErrorCount' }
          }
        },
        {
          $sort: {
            '_id.collectionId': 1,
            '_id.modeRank': 1
          }
        },
        {
          $group: {
            _id: '$_id.collectionId',
            trainingAmount: { $first: '$trainingAmount' },
            activeTrainingAmount: { $first: '$activeTrainingAmount' },
            finalErrorAmount: { $first: '$finalErrorAmount' },
            modeCounts: {
              $push: {
                mode: '$_id.mode',
                activeCount: '$activeCount',
                finalErrorCount: '$finalErrorCount'
              }
            }
          }
        }
      ],
      {
        ...readFromSecondary
      }
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
            count: { $sum: 1 }
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

  const list = collections.map((item, index) => ({
    ...item,
    tags: tags[index],
    dataAmount: dataAmount.find((amount) => String(amount._id) === String(item._id))?.count || 0,
    ...formatTrainingStatus(
      trainingAmount.find((amount) => String(amount._id) === String(item._id))
    ),
    permission: getCollectionPermission(item, collectionPermissionMap)
  }));

  // count collections
  return ListCollectionV2ResponseSchema.parse({ list, total });
}

export default NextAPI(handler);
