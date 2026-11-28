import type { DbSession } from '@fastgpt/dal/db/types';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { Types } from '../../../../common/mongo';
import { bridgeDbSessionToClientSession } from '../../../../common/mongo/sessionRun';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { MongoDatasetCollection } from '../schema';
import { buildDatasetCollectionNameSortKey } from '../sortKey';

const MAX_INDEXED_PARENT_PROBE_SIZE = 50;

export type BulkRenameDatasetCollectionItem = {
  collectionId: string;
  name: string;
  apiFileId?: string;
};

export type DatasetCollectionListParentFilter =
  | Types.ObjectId
  | null
  | { $in: readonly (Types.ObjectId | null)[] };

export type DatasetCollectionListMatch = {
  teamId: Types.ObjectId;
  datasetId: Types.ObjectId;
  parentId?: DatasetCollectionListParentFilter;
  _id?: { $in: readonly Types.ObjectId[] };
  [key: string]: unknown;
};

/**
 * 批量更新集合名称并同步写入 `nameSortKey`。
 * `bulkWrite` 不会触发 Mongoose 更新 Hook，所有批量改名路径必须统一经此入口。
 */
export const bulkRenameDatasetCollections = async ({
  teamId,
  datasetId,
  items,
  tx
}: {
  teamId: string;
  datasetId: string;
  items: BulkRenameDatasetCollectionItem[];
  tx?: DbSession;
}): Promise<{ modifiedCount: number }> => {
  if (items.length === 0) return { modifiedCount: 0 };

  const session = bridgeDbSessionToClientSession(tx);
  const result = await MongoDatasetCollection.bulkWrite(
    items.map(({ collectionId, apiFileId, name }) => ({
      updateOne: {
        filter: {
          _id: collectionId,
          teamId,
          datasetId,
          ...(apiFileId !== undefined ? { apiFileId } : {})
        },
        update: {
          $set: {
            name,
            nameSortKey: buildDatasetCollectionNameSortKey(name)
          }
        }
      }
    })),
    session ? { session } : undefined
  );

  return { modifiedCount: result.modifiedCount };
};

const isIndexedParentProbe = (parentId: DatasetCollectionListParentFilter | undefined): boolean => {
  if (parentId === undefined) return false;
  if (parentId === null || parentId instanceof Types.ObjectId) return true;
  return parentId.$in.length <= MAX_INDEXED_PARENT_PROBE_SIZE;
};

/**
 * 探测本次名称排序范围内是否仍存在未回填 `nameSortKey` 的存量集合。
 * - 目录浏览与小范围 `$in`（如历史 SYSTEM_ROOT / 小子树搜索）直接按 `fg_dataset_col_parent_name_sort`
 *   前缀 `(teamId, datasetId, parentId, nameSortKey: null)` 探测，O(log N) 且零回表。
 * - 根目录全文搜索或超大子树回退到完整 `match` 范围探测，避免在迁移完成前漏判未回填文档。
 */
export const hasUnmigratedDatasetCollectionSortKey = async (
  match: DatasetCollectionListMatch
): Promise<boolean> => {
  if (match._id?.$in.length === 0) {
    return false;
  }

  const probeFilter = isIndexedParentProbe(match.parentId)
    ? {
        teamId: match.teamId,
        datasetId: match.datasetId,
        parentId: match.parentId,
        nameSortKey: null
      }
    : {
        ...match,
        nameSortKey: null
      };

  const missing = await MongoDatasetCollection.findOne(
    probeFilter,
    { _id: 1 },
    readFromSecondary
  ).lean();
  return Boolean(missing);
};

/**
 * 查询知识库集合列表当前页。
 * - `sortBy === 'name'`：常态直接按持久化拼音排序键 `nameSortKey` + `_id` 双向扫描
 *   （目录浏览命中 `fg_dataset_col_parent_name_sort` 索引，零阻塞排序，严格逆序）；
 *   若过渡期仍存在未回填 `nameSortKey` 的存量集合，自动回落到旧的 `lower(name)` 聚合排序。
 * - `createTime` / `updateTime`：沿用原索引字段直排，不追加非索引兜底键。
 */
export const queryDatasetCollectionListPage = async ({
  match,
  selectField,
  sortBy,
  sortOrder,
  offset,
  pageSize
}: {
  match: DatasetCollectionListMatch;
  selectField: Record<string, 1>;
  sortBy: 'name' | 'createTime' | 'updateTime';
  sortOrder: 'asc' | 'desc';
  offset: number;
  pageSize: number;
}): Promise<DatasetCollectionSchemaType[]> => {
  if (match._id?.$in.length === 0) {
    return [];
  }

  const sortDirection = sortOrder === 'desc' ? -1 : 1;

  if (sortBy === 'name') {
    const hasUnmigrated = await hasUnmigratedDatasetCollectionSortKey(match);
    if (hasUnmigrated) {
      return MongoDatasetCollection.aggregate<DatasetCollectionSchemaType>(
        [
          { $match: match },
          { $addFields: { nameSortKey: { $toLower: '$name' } } },
          // 名称忽略大小写后可能相同，用唯一 ID 固定同值顺序，避免跨页重复或漏项。
          { $sort: { nameSortKey: sortDirection, _id: sortDirection } },
          { $skip: offset },
          { $limit: pageSize },
          { $project: selectField }
        ],
        { ...readFromSecondary }
      );
    }

    return MongoDatasetCollection.find(match, undefined, { ...readFromSecondary })
      .select(selectField)
      .sort({ nameSortKey: sortDirection, _id: sortDirection })
      .skip(offset)
      .limit(pageSize)
      .lean();
  }

  return (
    MongoDatasetCollection.find(match, undefined, { ...readFromSecondary })
      .select(selectField)
      // 不加 _id 兜底键：默认 updateTime 排序依赖 (teamId,datasetId,parentId,updateTime) 索引，
      // 追加非索引字段会让 Mongo 退化为阻塞排序，分页越深代价越高。
      .sort({ [sortBy]: sortDirection })
      .skip(offset)
      .limit(pageSize)
      .lean()
  );
};
