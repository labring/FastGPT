import { Types } from '@fastgpt/service/common/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import {
  buildTeamMemberNameSortKey,
  isValidTeamMemberNameSortKey
} from '@fastgpt/service/support/user/team/sortKey';

const MAX_CAS_ATTEMPTS = 3;

export type BackfillTeamMemberSortKeyBatchResult = {
  backfilledCount: number;
  failures: Map<string, string>;
};

/**
 * 按稳定 ID 批量重读并回填 `nameSortKey`，使用 `( _id, name )` CAS 条件批写，
 * 避免覆盖并发改名产生的新排序键；已与当前 `name` 一致的记录自动跳过，保证幂等重放。
 */
export const backfillTeamMemberSortKeyBatch = async (
  ids: string[]
): Promise<BackfillTeamMemberSortKeyBatchResult> => {
  const collection = MongoTeamMember.collection;
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
      const expectedKey = buildTeamMemberNameSortKey(raw.name);
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
      if (latest.nameSortKey !== buildTeamMemberNameSortKey(latest.name)) {
        retryIds.push(String(latest._id));
      }
    }
    pendingIds = retryIds;
  }

  for (const id of pendingIds) {
    failures.set(id, 'Team member name changed repeatedly while backfilling nameSortKey');
  }

  return {
    backfilledCount,
    failures
  };
};

/**
 * 在固定 `_id` 上界内按索引分批校验每条成员记录的 `nameSortKey` 均已就绪且与 `name` 一致。
 */
export const readTeamMemberSortKeyValidationBatch = async ({
  endId,
  lastId,
  limit
}: {
  endId: string;
  lastId: string | null;
  limit: number;
}) => {
  const records = await MongoTeamMember.collection
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
    const expectedKey = buildTeamMemberNameSortKey(record.name);
    if (!isValidTeamMemberNameSortKey(record.nameSortKey) || record.nameSortKey !== expectedKey) {
      invalidIds.push(String(record._id));
    }
  }

  return {
    lastId: records.length > 0 ? String(records.at(-1)!._id) : null,
    scanned: records.length,
    invalidIds
  };
};
