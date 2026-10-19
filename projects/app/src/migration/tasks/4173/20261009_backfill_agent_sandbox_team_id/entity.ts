/** 本次团队归属回填专用的数据访问；不向沙箱运行期暴露迁移能力。 */
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';

/** 迁移扫描的最小文档形态。 */
export type SandboxTeamIdRecord = {
  _id: Types.ObjectId;
  sourceType: string;
  sourceId: string;
};

const missingTeamIdFilter = { $or: [{ teamId: { $exists: false } }, { teamId: null }] };
const missingTeamIdProjection = { projection: { _id: 1, sourceType: 1, sourceId: 1 } };

/** 迁移用：仍缺失 teamId 的记录的最大 _id（无记录时为 null）。 */
export async function getSandboxTeamIdSnapshotEnd() {
  const last = await MongoSandboxInstance.collection.findOne(missingTeamIdFilter, {
    projection: { _id: 1 },
    sort: { _id: -1 }
  });
  return last ? String(last._id) : null;
}

/** 迁移用：按 ObjectId 游标分批读取缺失 teamId 的实例记录。 */
export function readSandboxTeamIdBatch(params: {
  lastId: string | null;
  endId: string;
  limit: number;
}) {
  return MongoSandboxInstance.collection
    .find<SandboxTeamIdRecord>(
      {
        ...missingTeamIdFilter,
        _id: {
          ...(params.lastId ? { $gt: new Types.ObjectId(params.lastId) } : {}),
          $lte: new Types.ObjectId(params.endId)
        }
      },
      missingTeamIdProjection
    )
    .sort({ _id: 1 })
    .limit(params.limit)
    .toArray();
}

/** 迁移用：读取单条仍缺失 teamId 的实例；已被修复或删除时返回 null。 */
export function readSandboxTeamIdRecord(recordId: string) {
  return MongoSandboxInstance.collection.findOne<SandboxTeamIdRecord>(
    { _id: new Types.ObjectId(recordId), ...missingTeamIdFilter },
    missingTeamIdProjection
  );
}

/** 批量读取来源归属；使用原始集合兼容历史数据，不触发 Mongoose 字段转换。 */
export async function readSandboxSourceTeams(params: {
  sourceType: ChatSourceTypeEnum.app | ChatSourceTypeEnum.skillEdit;
  sourceIds: string[];
}) {
  const ids = [...new Set(params.sourceIds)]
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (ids.length === 0) return [];

  const collection =
    params.sourceType === ChatSourceTypeEnum.app
      ? MongoApp.collection
      : MongoAgentSkills.collection;
  return collection
    .find<{
      _id: Types.ObjectId;
      teamId?: unknown;
      deleteTime?: unknown;
    }>({ _id: { $in: ids } }, { projection: { _id: 1, teamId: 1, deleteTime: 1 } })
    .toArray();
}

/** 迁移用：批量 CAS 回填 teamId；过滤条件携带「仍缺失」状态，只补不覆写、重放幂等。 */
export async function backfillSandboxInstanceTeamIdsBatch(
  items: Array<{ _id: Types.ObjectId; teamId: string }>
) {
  if (items.length === 0) return;
  await mongoSessionRun((session) =>
    MongoSandboxInstance.collection.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { _id: item._id, ...missingTeamIdFilter },
          update: { $set: { teamId: item.teamId } }
        }
      })),
      { session, ordered: false }
    )
  );
}
