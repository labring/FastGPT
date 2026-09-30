import { Types, type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';

/** 本任务唯一的失败明细阶段。 */
export const MEMBER_NAME_SET_STAGE_KEY = 'members';

/** 迁移扫描的最小文档形态。 */
export type MemberNameSetDoc = {
  _id: Types.ObjectId;
  name: string;
  userId?: Types.ObjectId | null;
  isSetMemberName?: boolean;
};

export type MemberNameSetCounts = {
  placeholderCount: number;
  usernameMatchCount: number;
  setTrueCount: number;
};

export type MemberNameSetOrphan = {
  tmbId: string;
  userId: string;
};

/** 固定本次迁移的扫描上界，避免滚动升级期间新增成员让扫描范围不断增长。 */
export const getMemberNameSetSnapshotEnd = async (): Promise<string | null> => {
  const last = await MongoTeamMember.collection.findOne(
    { _id: { $type: 'objectId' } },
    { projection: { _id: 1 }, sort: { _id: -1 } }
  );
  return last ? String(last._id) : null;
};

/** 按 ObjectId 游标分批读取成员文档；包含已回填记录，保证批次重放幂等。 */
export const readMemberNameSetBatch = ({
  lastId,
  endId,
  limit
}: {
  lastId: string | null;
  endId: string;
  limit: number;
}) =>
  MongoTeamMember.collection
    .find(
      {
        _id: {
          ...(lastId ? { $gt: new Types.ObjectId(lastId) } : {}),
          $lte: new Types.ObjectId(endId)
        }
      },
      { projection: { _id: 1, name: 1, userId: 1, isSetMemberName: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray() as Promise<MemberNameSetDoc[]>;

/** 批量读取用户登录名，供占位符回落与历史 username 回落名匹配使用。 */
export const readUsernameMap = async (
  userIds: Array<Types.ObjectId | string>
): Promise<Map<string, string>> => {
  const uniqueIds = Array.from(new Set(userIds.map(String))).filter(Boolean);
  if (uniqueIds.length === 0) return new Map();
  const users = await MongoUser.collection
    .find(
      { _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) } },
      { projection: { _id: 1, username: 1 } }
    )
    .toArray();
  return new Map(
    users
      .map((user) => [String(user._id), String(user.username ?? '').trim()] as const)
      .filter(([, username]) => username.length > 0)
  );
};

/** 幂等更新操作：过滤条件携带 _id 与当前状态，重复执行不会重复生效。 */
export type MemberNameSetOp = {
  updateOne: {
    filter: Record<string, unknown>;
    update: { $set: Record<string, unknown> };
  };
};

export type MemberNameSetPlan =
  | { kind: 'placeholder'; name: string }
  | { kind: 'orphan' }
  | { kind: 'usernameMatch' }
  | { kind: 'setTrue' }
  | { kind: 'skip' };

/**
 * 单文档迁移规划：
 * - 占位符名：回落到 username 并记 false；用户/用户名缺失时为孤儿坏数据；
 * - 已有 isSetMemberName（新代码写入或已迁移）：跳过，保证重放不覆盖显式 false；
 * - name 与完整 username 精确一致：记 false（历史自动回落名）；
 * - 其余（含用户缺失的非占位符文档）：记 true，不触发强制补齐。
 */
export const planMemberNameSetDoc = ({
  doc,
  username
}: {
  doc: MemberNameSetDoc;
  username?: string;
}): MemberNameSetPlan => {
  if (doc.name === UNSET_TEAM_MEMBER_NAME) {
    return username ? { kind: 'placeholder', name: username } : { kind: 'orphan' };
  }
  if (doc.isSetMemberName !== undefined) return { kind: 'skip' };
  if (username && username.trim() === doc.name.trim()) {
    return { kind: 'usernameMatch' };
  }
  return { kind: 'setTrue' };
};

/**
 * 将一批文档规划为幂等 bulkWrite 操作。
 * 过滤条件携带 _id 与当前状态（占位符名 / 字段缺失），重复执行不会重复生效，
 * 也不会把新代码显式写入的 false 覆盖成 true。
 */
export const buildMemberNameSetOps = ({
  docs,
  usernameMap
}: {
  docs: MemberNameSetDoc[];
  usernameMap: Map<string, string>;
}): {
  ops: MemberNameSetOp[];
  orphans: MemberNameSetOrphan[];
  counts: MemberNameSetCounts;
} => {
  const ops: MemberNameSetOp[] = [];
  const orphans: MemberNameSetOrphan[] = [];
  const counts: MemberNameSetCounts = {
    placeholderCount: 0,
    usernameMatchCount: 0,
    setTrueCount: 0
  };

  for (const doc of docs) {
    const username = doc.userId ? usernameMap.get(String(doc.userId)) : undefined;
    const plan = planMemberNameSetDoc({ doc, username });

    if (plan.kind === 'placeholder') {
      ops.push({
        updateOne: {
          filter: { _id: doc._id, name: UNSET_TEAM_MEMBER_NAME },
          update: { $set: { name: plan.name, isSetMemberName: false } }
        }
      });
      counts.placeholderCount += 1;
    } else if (plan.kind === 'orphan') {
      orphans.push({ tmbId: String(doc._id), userId: doc.userId ? String(doc.userId) : '' });
    } else if (plan.kind === 'usernameMatch') {
      ops.push({
        updateOne: {
          filter: { _id: doc._id, isSetMemberName: { $exists: false } },
          update: { $set: { isSetMemberName: false } }
        }
      });
      counts.usernameMatchCount += 1;
    } else if (plan.kind === 'setTrue') {
      ops.push({
        updateOne: {
          filter: { _id: doc._id, isSetMemberName: { $exists: false } },
          update: { $set: { isSetMemberName: true } }
        }
      });
      counts.setTrueCount += 1;
    }
  }

  return { ops, orphans, counts };
};

/** 事务内提交一批写入；空操作直接返回。 */
export const writeMemberNameSetBatch = ({
  ops,
  session
}: {
  ops: MemberNameSetOp[];
  session?: ClientSession;
}) => {
  if (ops.length === 0) return Promise.resolve();
  const run = async (activeSession: ClientSession) => {
    await MongoTeamMember.collection.bulkWrite(ops, { session: activeSession, ordered: false });
  };
  return session ? run(session) : mongoSessionRun(run);
};

/** 按 ID 集合读取仍为占位符的成员文档，供孤儿快照重处理使用。 */
export const readMemberNameSetDocsByIds = (ids: string[]) =>
  MongoTeamMember.collection
    .find(
      { _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, name: UNSET_TEAM_MEMBER_NAME },
      { projection: { _id: 1, name: 1, userId: 1, isSetMemberName: 1 } }
    )
    .toArray() as Promise<MemberNameSetDoc[]>;

/** 孤儿记录转失败明细：只保存必要 ID 与原因，不复制业务正文。 */
export const orphanToFailedRecord = (orphan: MemberNameSetOrphan): SystemMigrationFailedRecord => ({
  stageKey: MEMBER_NAME_SET_STAGE_KEY,
  data: { tmbId: orphan.tmbId, userId: orphan.userId },
  reason: {
    message:
      'Team member name is the legacy placeholder but its user or username cannot be resolved'
  }
});

export const countPlaceholderMemberNames = (endId?: string) =>
  MongoTeamMember.collection.countDocuments({
    ...(endId ? { _id: { $lte: new Types.ObjectId(endId) } } : {}),
    name: UNSET_TEAM_MEMBER_NAME
  });

/** 完成校验：扫描范围内不允许残留未回填 isSetMemberName 的文档。 */
export const countMissingMemberNameSet = (endId?: string) =>
  MongoTeamMember.collection.countDocuments({
    ...(endId ? { _id: { $lte: new Types.ObjectId(endId) } } : {}),
    isSetMemberName: { $exists: false }
  });
