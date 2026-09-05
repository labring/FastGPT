import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { Types, type Model } from '@fastgpt/service/common/mongo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

export type ResourceOwnerAclStageKey = 'apps' | 'datasets' | 'agent_skills';

export type ResourceOwnerAclConfig = {
  stageKey: ResourceOwnerAclStageKey;
  resourceType: PerResourceTypeEnum;
  model: Model<any>;
};

export type ResourceOwnerAclRecord = {
  _id: unknown;
  teamId?: unknown;
};

export type ResourceOwnerAclFailure = {
  record: ResourceOwnerAclRecord;
  message: string;
};

const DB_CONCURRENCY = 20;

/** 限制迁移批次内部的 Mongo 并发，避免一个批次横跨大量团队时瞬间打满连接池。 */
const runWithConcurrency = async <Input, Output>({
  items,
  action
}: {
  items: Input[];
  action: (item: Input) => Promise<Output>;
}) => {
  const results: Output[] = [];
  for (let index = 0; index < items.length; index += DB_CONCURRENCY) {
    results.push(...(await Promise.all(items.slice(index, index + DB_CONCURRENCY).map(action))));
  }
  return results;
};

export const resourceOwnerAclConfigs: ResourceOwnerAclConfig[] = [
  { stageKey: 'apps', resourceType: PerResourceTypeEnum.app, model: MongoApp },
  { stageKey: 'datasets', resourceType: PerResourceTypeEnum.dataset, model: MongoDataset },
  {
    stageKey: 'agent_skills',
    resourceType: PerResourceTypeEnum.agentSkill,
    model: MongoAgentSkills
  }
];

const toObjectId = (value: unknown): Types.ObjectId | undefined => {
  if (value instanceof Types.ObjectId) return value;

  const valueString = String(value ?? '');
  if (!Types.ObjectId.isValid(valueString)) return;
  const objectId = new Types.ObjectId(valueString);
  return String(objectId) === valueString ? objectId : undefined;
};

const getRecordKey = (record: ResourceOwnerAclRecord) => String(record._id);

/** 固定单个资源集合的 ObjectId 扫描上界，避免在线新增记录让主扫描无法结束。 */
export const initializeResourceOwnerAclSnapshot = async (config: ResourceOwnerAclConfig) => {
  const lastResource = await config.model.collection
    .find({ _id: { $type: 'objectId' } }, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .next();
  const endId = toObjectId(lastResource?._id);
  const total = endId
    ? await config.model.collection.countDocuments({
        _id: { $type: 'objectId', $lte: endId }
      })
    : 0;

  return { endId: endId ? String(endId) : null, total };
};

/** 按不可变 ObjectId 游标读取固定快照中的下一批资源。 */
export const readResourceOwnerAclBatch = async ({
  config,
  endId,
  lastId,
  limit
}: {
  config: ResourceOwnerAclConfig;
  endId?: string;
  lastId: string | null;
  limit: number;
}): Promise<ResourceOwnerAclRecord[]> => {
  const idRange: { $gt?: Types.ObjectId; $lte?: Types.ObjectId } = {};
  if (lastId) idRange.$gt = new Types.ObjectId(lastId);
  if (endId) idRange.$lte = new Types.ObjectId(endId);

  return config.model.collection
    .find(
      {
        _id: {
          $type: 'objectId',
          ...idRange
        }
      },
      { projection: { _id: 1, teamId: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();
};

/** 按稳定 `_id` 游标读取无法作为 resourceId 写入 ACL 的异常资源。 */
export const readInvalidResourceOwnerAclRecords = ({
  config,
  lastId,
  limit
}: {
  config: ResourceOwnerAclConfig;
  lastId?: unknown;
  limit: number;
}) =>
  config.model.collection
    .find(
      {
        _id: {
          $not: { $type: 'objectId' },
          ...(lastId === undefined ? {} : { $gt: lastId })
        }
      } as never,
      { projection: { _id: 1, teamId: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();

/** 按当前资源团队验证成员 Owner ACL，悬空成员或跨团队成员不视为有效 owner。 */
export const findValidOwnerResourceIds = async ({
  config,
  records
}: {
  config: ResourceOwnerAclConfig;
  records: ResourceOwnerAclRecord[];
}) => {
  const recordsByTeam = new Map<string, Types.ObjectId[]>();
  for (const record of records) {
    const resourceId = toObjectId(record._id);
    const teamId = toObjectId(record.teamId);
    if (!resourceId || !teamId) continue;
    const resourceIds = recordsByTeam.get(String(teamId)) ?? [];
    resourceIds.push(resourceId);
    recordsByTeam.set(String(teamId), resourceIds);
  }

  const permissionRows = (
    await runWithConcurrency({
      items: [...recordsByTeam],
      action: ([teamId, resourceIds]) =>
        MongoResourcePermission.collection
          .find(
            {
              teamId: new Types.ObjectId(teamId),
              resourceType: config.resourceType,
              resourceId: { $in: resourceIds },
              tmbId: { $exists: true },
              permission: OwnerRoleVal
            },
            { projection: { resourceId: 1, teamId: 1, tmbId: 1 } }
          )
          .toArray()
    })
  ).flat();
  const tmbIds = permissionRows
    .map((row) => toObjectId(row.tmbId))
    .filter((tmbId): tmbId is Types.ObjectId => Boolean(tmbId));
  const members =
    tmbIds.length === 0
      ? []
      : await MongoTeamMember.collection
          .find({ _id: { $in: tmbIds } }, { projection: { _id: 1, teamId: 1 } })
          .toArray();
  const memberTeamById = new Map(
    members.map((member) => [String(member._id), String(member.teamId)])
  );

  return new Set(
    permissionRows.flatMap((row) => {
      const tmbId = toObjectId(row.tmbId);
      const teamId = toObjectId(row.teamId);
      const resourceId = toObjectId(row.resourceId);
      if (!tmbId || !teamId || !resourceId) return [];
      return memberTeamById.get(String(tmbId)) === String(teamId) ? [String(resourceId)] : [];
    })
  );
};

/**
 * 只为缺少有效成员 Owner ACL 的资源补 team owner。
 * 单条 ACL 使用唯一键 upsert，写入后再次验证，因此整个批次可以安全重放。
 */
export const backfillResourceOwnerAclRecords = async ({
  config,
  records
}: {
  config: ResourceOwnerAclConfig;
  records: ResourceOwnerAclRecord[];
}): Promise<{ failures: ResourceOwnerAclFailure[] }> => {
  if (records.length === 0) return { failures: [] };

  const validOwnerResourceIds = await findValidOwnerResourceIds({ config, records });
  const ownerlessRecords = records.filter(
    (record) => !validOwnerResourceIds.has(getRecordKey(record))
  );
  const failures = new Map<string, ResourceOwnerAclFailure>();
  const recordsByTeam = new Map<string, ResourceOwnerAclRecord[]>();

  for (const record of ownerlessRecords) {
    const resourceId = toObjectId(record._id);
    if (!resourceId) {
      failures.set(getRecordKey(record), { record, message: 'Resource _id is not an ObjectId' });
      continue;
    }
    const teamId = toObjectId(record.teamId);
    if (!teamId) {
      failures.set(getRecordKey(record), { record, message: 'Resource teamId is not an ObjectId' });
      continue;
    }
    const teamRecords = recordsByTeam.get(String(teamId)) ?? [];
    teamRecords.push(record);
    recordsByTeam.set(String(teamId), teamRecords);
  }

  const teamIds = [...recordsByTeam.keys()].map((teamId) => new Types.ObjectId(teamId));
  const teams =
    teamIds.length === 0
      ? []
      : await MongoTeam.collection
          .find({ _id: { $in: teamIds } }, { projection: { _id: 1, ownerId: 1 } })
          .toArray();
  const teamById = new Map(teams.map((team) => [String(team._id), team]));
  const ownerPairs = teams.flatMap((team) => {
    const ownerId = toObjectId(team.ownerId);
    return ownerId ? [{ teamId: team._id, userId: ownerId }] : [];
  });
  const ownerMembers =
    ownerPairs.length === 0
      ? []
      : await MongoTeamMember.collection
          .find({ $or: ownerPairs }, { projection: { _id: 1, teamId: 1, userId: 1 } })
          .toArray();
  const ownerMemberByTeamId = new Map(
    ownerMembers.map((member) => [String(member.teamId), member])
  );

  const writeActions: Array<() => Promise<void>> = [];
  for (const [teamId, teamRecords] of recordsByTeam) {
    const team = teamById.get(teamId);
    const ownerId = toObjectId(team?.ownerId);
    const ownerMember = ownerMemberByTeamId.get(teamId);
    if (!team || !ownerId || !ownerMember) {
      const errorMessage = (() => {
        if (!team) return 'Resource team does not exist';
        if (!ownerId) return 'Resource team has no valid ownerId';
        return 'Resource team owner has no team member record';
      })();
      for (const record of teamRecords) {
        failures.set(getRecordKey(record), { record, message: errorMessage });
      }
      continue;
    }

    for (const record of teamRecords) {
      const resourceId = toObjectId(record._id)!;
      writeActions.push(() =>
        MongoResourcePermission.collection
          .updateOne(
            {
              teamId: new Types.ObjectId(teamId),
              resourceType: config.resourceType,
              resourceId,
              tmbId: ownerMember._id
            },
            { $set: { permission: OwnerRoleVal } },
            { upsert: true }
          )
          .then(() => undefined)
          .catch((error) => {
            failures.set(getRecordKey(record), {
              record,
              message: error instanceof Error ? error.message : String(error)
            });
            return undefined;
          })
      );
    }
  }

  await runWithConcurrency({ items: writeActions, action: (write) => write() });
  const verifiedOwnerResourceIds = await findValidOwnerResourceIds({ config, records });
  for (const record of records) {
    const recordId = getRecordKey(record);
    if (verifiedOwnerResourceIds.has(recordId)) {
      failures.delete(recordId);
      continue;
    }

    const resourceId = toObjectId(record._id);
    const current = resourceId
      ? await config.model.collection.findOne({ _id: resourceId }, { projection: { _id: 1 } })
      : await config.model.collection.findOne(
          { _id: record._id as never },
          { projection: { _id: 1 } }
        );
    if (!current) {
      failures.delete(recordId);
      continue;
    }
    if (!failures.has(recordId)) {
      failures.set(recordId, { record, message: 'Resource still has no valid member Owner ACL' });
    }
  }

  return { failures: [...failures.values()] };
};
