import { Types } from '@fastgpt/service/common/mongo';
import { isValidPinyinNameSortKey } from '@fastgpt/service/common/string/sortKey';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { buildTeamMemberNameSortKey } from '@fastgpt/service/support/user/team/sortKey';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { buildDatasetCollectionNameSortKey } from '@fastgpt/service/core/dataset/collection/sortKey';

const MAX_CAS_ATTEMPTS = 3;

export type SortKeyBackfillTargetKey = 'members' | 'collections';

/** 两个需回填拼音排序键的目标执行顺序（先团队成员，再知识库集合）。 */
export const SORT_KEY_BACKFILL_TARGETS: readonly SortKeyBackfillTargetKey[] = [
  'members',
  'collections'
];

export type SortKeyBackfillBatchResult = {
  backfilledCount: number;
  failures: Map<string, string>;
};

type SortKeyBackfillTarget = {
  entityLabel: string;
  getCollection: () => typeof MongoDatasetCollection.collection;
  buildSortKey: (name: unknown) => string;
};

const sortKeyBackfillTargets: Record<SortKeyBackfillTargetKey, SortKeyBackfillTarget> = {
  members: {
    entityLabel: 'Team member',
    getCollection: () => MongoTeamMember.collection,
    buildSortKey: buildTeamMemberNameSortKey
  },
  collections: {
    entityLabel: 'Dataset collection',
    getCollection: () => MongoDatasetCollection.collection,
    buildSortKey: buildDatasetCollectionNameSortKey
  }
};

/** 返回面向错误提示的实体标签，避免编排层直接接触底层集合配置。 */
export const getSortKeyBackfillEntityLabel = (target: SortKeyBackfillTargetKey) =>
  sortKeyBackfillTargets[target].entityLabel;

/**
 * 读取目标集合的固定 `_id` 上界与初始总量，用于初始化断点续跑边界。
 */
export const readNameSortKeyBackfillBounds = async (
  target: SortKeyBackfillTargetKey
): Promise<{ endId: string | null; total: number }> => {
  const collection = sortKeyBackfillTargets[target].getCollection();
  const last = await collection.findOne({}, { projection: { _id: 1 }, sort: { _id: -1 } });
  const endId = last ? String(last._id) : null;
  const total = endId
    ? await collection.countDocuments({ _id: { $lte: new Types.ObjectId(endId) } })
    : 0;
  return { endId, total };
};

/**
 * 在固定 `_id` 上界内按 `_id` 索引游标分批读取下一批待检查记录 ID。
 */
export const readNameSortKeyBackfillBatchIds = async ({
  target,
  endId,
  lastId,
  limit
}: {
  target: SortKeyBackfillTargetKey;
  endId: string;
  lastId: string | null;
  limit: number;
}): Promise<string[]> => {
  const records = await sortKeyBackfillTargets[target]
    .getCollection()
    .find(
      {
        _id: {
          $lte: new Types.ObjectId(endId),
          ...(lastId ? { $gt: new Types.ObjectId(lastId) } : {})
        }
      },
      { projection: { _id: 1 } }
    )
    .sort({ _id: 1 })
    .hint({ _id: 1 })
    .limit(limit)
    .toArray();
  return records.map((record) => String(record._id));
};

/**
 * 按稳定 ID 批量重读并回填目标集合的 `nameSortKey`，使用 `(_id, name)` CAS 条件批写，
 * 避免覆盖并发改名产生的新排序键；已与当前 `name` 一致的记录自动跳过，保证幂等重放。
 */
export const backfillNameSortKeyBatch = async ({
  target,
  ids
}: {
  target: SortKeyBackfillTargetKey;
  ids: string[];
}): Promise<SortKeyBackfillBatchResult> => {
  const { getCollection, entityLabel, buildSortKey } = sortKeyBackfillTargets[target];
  const collection = getCollection();
  const failures = new Map<string, string>();
  let backfilledCount = 0;

  let pendingIds = [...ids];
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS && pendingIds.length > 0; attempt++) {
    const rawRecords = await collection
      .find(
        { _id: { $in: pendingIds.map((id) => new Types.ObjectId(id)) } },
        { projection: { _id: 1, name: 1, nameSortKey: 1 } }
      )
      .toArray();

    const operations: Array<{
      updateOne: {
        filter: Record<string, unknown>;
        update: { $set: { nameSortKey: string } };
      };
    }> = [];
    const opIds: string[] = [];

    for (const raw of rawRecords) {
      const expectedKey = buildSortKey(raw.name);
      if (raw.nameSortKey === expectedKey) {
        continue;
      }

      operations.push({
        updateOne: {
          filter: {
            _id: raw._id,
            // 按原值精确比对，避免并发改名时写入过期排序键，并防止异常对象值被解释为查询运算符。
            name: raw.name === undefined ? { $exists: false } : { $eq: raw.name }
          },
          update: {
            $set: {
              nameSortKey: expectedKey
            }
          }
        }
      });
      opIds.push(String(raw._id));
    }

    if (operations.length === 0) {
      pendingIds = [];
      break;
    }

    const result = await collection.bulkWrite(operations, { ordered: false });
    backfilledCount += result.modifiedCount;

    // 全部命中说明本批无并发变更，无需再次读库核验。
    if (result.matchedCount === operations.length) {
      pendingIds = [];
      break;
    }

    // 部分未命中时仅对本批涉及 ID 复查：已删除或已被新节点同步更新为最新排序键的记录视为完成。
    const latestRecords = await collection
      .find(
        { _id: { $in: opIds.map((id) => new Types.ObjectId(id)) } },
        { projection: { _id: 1, name: 1, nameSortKey: 1 } }
      )
      .toArray();

    const retryIds: string[] = [];
    for (const latest of latestRecords) {
      if (latest.nameSortKey !== buildSortKey(latest.name)) {
        retryIds.push(String(latest._id));
      }
    }
    pendingIds = retryIds;
  }

  for (const id of pendingIds) {
    failures.set(id, `${entityLabel} name changed repeatedly while backfilling nameSortKey`);
  }

  return {
    backfilledCount,
    failures
  };
};

/**
 * 在固定 `_id` 上界内按索引分批校验目标集合每条记录的 `nameSortKey` 均已就绪且与 `name` 一致。
 */
export const readNameSortKeyValidationBatch = async ({
  target,
  endId,
  lastId,
  limit
}: {
  target: SortKeyBackfillTargetKey;
  endId: string;
  lastId: string | null;
  limit: number;
}) => {
  const { getCollection, buildSortKey } = sortKeyBackfillTargets[target];
  const records = await getCollection()
    .find(
      {
        _id: {
          $lte: new Types.ObjectId(endId),
          ...(lastId ? { $gt: new Types.ObjectId(lastId) } : {})
        }
      },
      { projection: { _id: 1, name: 1, nameSortKey: 1 } }
    )
    .sort({ _id: 1 })
    .hint({ _id: 1 })
    .limit(limit)
    .toArray();

  const invalidIds: string[] = [];
  for (const record of records) {
    const expectedKey = buildSortKey(record.name);
    if (!isValidPinyinNameSortKey(record.nameSortKey) || record.nameSortKey !== expectedKey) {
      invalidIds.push(String(record._id));
    }
  }

  return {
    lastId: records.length > 0 ? String(records.at(-1)!._id) : null,
    scanned: records.length,
    invalidIds
  };
};
