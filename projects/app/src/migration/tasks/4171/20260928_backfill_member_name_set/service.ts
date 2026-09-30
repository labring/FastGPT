import { Types, type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

/** 迁移扫描的最小文档形态。 */
export type MemberNameSetDoc = {
  _id: Types.ObjectId;
  name: string;
  userId?: Types.ObjectId | null;
  role?: string | null;
  isSetMemberName?: boolean;
};

export type MemberNameSetCounts = {
  ownerCount: number;
  usernameMatchCount: number;
  setTrueCount: number;
};

/** 固定本次迁移的扫描上界，避免滚动升级期间新增成员让扫描范围不断增长。 */
export const getMemberNameSetSnapshotEnd = async (): Promise<string | null> => {
  const last = await MongoTeamMember.collection.findOne(
    { _id: { $type: 'objectId' } },
    { projection: { _id: 1 }, sort: { _id: -1 } }
  );
  return last ? String(last._id) : null;
};

/** 按 ObjectId 游标分批读取成员文档；owner 需要覆盖已有值，其余记录保持幂等。 */
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
      { projection: { _id: 1, name: 1, userId: 1, role: 1, isSetMemberName: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray() as Promise<MemberNameSetDoc[]>;

/** 批量读取用户登录名，用于识别历史 username 回落名。 */
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

/** 幂等更新操作：过滤条件携带当前状态，避免重放覆盖非 owner 的新代码写入。 */
export type MemberNameSetOp = {
  updateOne: {
    filter: Record<string, unknown>;
    update: { $set: Record<string, unknown> };
  };
};

export type MemberNameSetPlan =
  | { kind: 'owner' }
  | { kind: 'usernameMatch' }
  | { kind: 'setTrue' }
  | { kind: 'skip' };

/**
 * 单文档迁移规划：owner 始终标记为 true；非 owner 仅处理缺失字段，
 * 完整 username 视为历史回落名并标记为 false，其余成员名标记为 true。
 */
export const planMemberNameSetDoc = ({
  doc,
  username
}: {
  doc: MemberNameSetDoc;
  username?: string;
}): MemberNameSetPlan => {
  if (doc.role === TeamMemberRoleEnum.owner) return { kind: 'owner' };
  if (doc.isSetMemberName !== undefined) return { kind: 'skip' };
  if (username && username.trim() === doc.name.trim()) return { kind: 'usernameMatch' };
  return { kind: 'setTrue' };
};

/** 将一批文档规划为幂等 bulkWrite 操作。 */
export const buildMemberNameSetOps = ({
  docs,
  usernameMap
}: {
  docs: MemberNameSetDoc[];
  usernameMap: Map<string, string>;
}): { ops: MemberNameSetOp[]; counts: MemberNameSetCounts } => {
  const ops: MemberNameSetOp[] = [];
  const counts: MemberNameSetCounts = { ownerCount: 0, usernameMatchCount: 0, setTrueCount: 0 };

  for (const doc of docs) {
    const username = doc.userId ? usernameMap.get(String(doc.userId)) : undefined;
    const plan = planMemberNameSetDoc({ doc, username });

    if (plan.kind === 'owner') {
      ops.push({
        updateOne: {
          filter: { _id: doc._id, role: TeamMemberRoleEnum.owner },
          update: { $set: { isSetMemberName: true } }
        }
      });
      counts.ownerCount += 1;
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

  return { ops, counts };
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

/** 完成校验：扫描范围内不允许残留未回填 isSetMemberName 的文档。 */
export const countMissingMemberNameSet = (endId?: string) =>
  MongoTeamMember.collection.countDocuments({
    ...(endId ? { _id: { $lte: new Types.ObjectId(endId) } } : {}),
    isSetMemberName: { $exists: false }
  });
