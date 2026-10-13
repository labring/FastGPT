import { Types, type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

const legacyRoleFilter = { role: { $exists: true, $ne: TeamMemberRoleEnum.owner } };

/** 修改前拒绝无法用 ObjectId 游标恢复的历史记录，不猜测或转换成员 ID。 */
export const validateTeamMemberRoleSource = async () => {
  const invalid = await MongoTeamMember.collection.findOne(
    { ...legacyRoleFilter, _id: { $not: { $type: 'objectId' } } },
    { projection: { _id: 1 } }
  );
  if (invalid) throw new Error('Legacy team member role has a non-ObjectId member ID');
};

/** 固定本次迁移的扫描上界，避免滚动升级期间新增正常成员让扫描范围不断增长。 */
export const getTeamMemberRoleSnapshotEnd = async () => {
  const last = await MongoTeamMember.collection.findOne(
    { ...legacyRoleFilter, _id: { $type: 'objectId' } },
    { projection: { _id: 1 }, sort: { _id: -1 } }
  );
  return last ? String(last._id) : null;
};

/** 按索引游标扫描成员 ID；包含已清理记录，保证提交后断点前崩溃时可完整重放批次。 */
export const readTeamMemberRoleBatch = async ({
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
      { projection: { _id: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray();

/** 事务内仅 unset 非 owner 字段并校验本批；不删除成员，不触碰权限或其他成员字段。 */
export const cleanupTeamMemberRoleBatch = async ({
  ids,
  session
}: {
  ids: Types.ObjectId[];
  session?: ClientSession;
}) => {
  const clean = async (activeSession: ClientSession) => {
    // 写入时重新判断角色，保护读取批次后刚转为 owner 的成员。
    const filter = { _id: { $in: ids }, ...legacyRoleFilter };
    await MongoTeamMember.collection.updateMany(
      filter,
      { $unset: { role: '' } },
      { session: activeSession }
    );
    const remaining = await MongoTeamMember.collection.countDocuments(filter, {
      session: activeSession
    });
    if (remaining) throw new Error('Legacy team member roles remain in cleanup batch');
  };
  return session ? clean(session) : mongoSessionRun(clean);
};

/** 全局完成条件包含游标之前及快照之后的数据，防止遗漏历史值后错误放行启动。 */
export const countRemainingTeamMemberRoles = () =>
  MongoTeamMember.collection.countDocuments(legacyRoleFilter);
