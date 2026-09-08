import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';

const legacyStatusFilter = { status: { $in: ['waiting', 'reject'] } };
// 全量策略仅面向少量历史邀请；超出安全规模时停止，不隐式切换恢复策略。
const maxMembers = 10_000;
const relatedCollections = ['resource_permissions', 'team_group_members', 'team_org_members'];

/**
 * 全量扫描并事务清理历史邀请。原始 collection 保留字符串/ObjectId 两种 tmbId。
 * 只删除 waiting/reject，保护团队、ACL、成员组所有者及旧资源作者。
 * 事务重试重新读取状态，成员并发接受邀请触发写冲突后会在重试中被排除。
 */
export const cleanupLegacyInvitedMemberRecords = async (assertActive: () => Promise<void>) => {
  return mongoSessionRun(async (session) => {
    await assertActive();
    const db = connectionMongo.connection.db!;
    const members = await db
      .collection('team_members')
      .find(legacyStatusFilter, {
        session,
        projection: { _id: 1, teamId: 1, role: 1 },
        sort: { _id: 1 },
        limit: maxMembers + 1
      })
      .toArray();
    if (members.length > maxMembers) throw new Error('Legacy invited member count exceeds 10000');
    const ids = members.map(({ _id }) => _id);
    const refs = [...ids, ...ids.map(String)];
    const failures = new Map<string, string>();
    for (const member of members) {
      if (!(member._id instanceof Types.ObjectId) || !(member.teamId instanceof Types.ObjectId)) {
        failures.set(String(member._id), 'Member _id or teamId is not an ObjectId');
      } else if (member.role === 'owner') {
        failures.set(String(member._id), 'Legacy invited member is a team owner');
      }
    }
    // 前置 owner ACL 回填可失败后继续，不能把它的成功作为删除安全性的前提。
    const protections = [
      { name: 'resource_permissions', filter: { permission: OwnerPermissionVal } },
      { name: 'team_group_members', filter: { role: 'owner' } },
      { name: 'apps', filter: {} },
      { name: 'datasets', filter: {} },
      { name: 'agent_skills', filter: {} }
    ];
    if (ids.length) {
      for (const { name, filter } of protections) {
        const owners = await db.collection(name).distinct(
          'tmbId',
          {
            ...filter,
            tmbId: { $in: refs }
          },
          { session }
        );
        for (const id of owners)
          failures.set(String(id), `Member owns or created a resource in ${name}`);
      }
    }
    const failedRecords: SystemMigrationFailedRecord[] = members.flatMap((member) => {
      const message = failures.get(String(member._id));
      return message
        ? [
            {
              stageKey: 'cleanup',
              data: { memberId: String(member._id), teamId: String(member.teamId) },
              reason: { message }
            }
          ]
        : [];
    });
    const deleteIds = ids.filter((id) => !failures.has(String(id)));
    const deleteRefs = [...deleteIds, ...deleteIds.map(String)];
    const relatedFilter = { tmbId: { $in: deleteRefs } };
    await assertActive();
    const counts = { members: 0, permissions: 0, groups: 0, orgs: 0 };
    if (deleteIds.length) {
      // session 内串行删除，任一步失败由事务整体回滚。
      counts.permissions = (
        await db.collection('resource_permissions').deleteMany(relatedFilter, { session })
      ).deletedCount;
      counts.groups = (
        await db.collection('team_group_members').deleteMany(relatedFilter, { session })
      ).deletedCount;
      counts.orgs = (
        await db.collection('team_org_members').deleteMany(relatedFilter, { session })
      ).deletedCount;
      counts.members = (
        await db.collection('team_members').deleteMany(
          {
            ...legacyStatusFilter,
            _id: { $in: deleteIds }
          },
          { session }
        )
      ).deletedCount;
      if (counts.members !== deleteIds.length)
        throw new Error('Legacy invited member delete count mismatch');
      for (const name of relatedCollections) {
        if (await db.collection(name).findOne(relatedFilter, { session, projection: { _id: 1 } })) {
          throw new Error(`Legacy invited member references remain in ${name}`);
        }
      }
    }
    await assertActive();
    return { counts, failedRecords };
  });
};

/** 提交后检查全部历史状态，存在新增或受保护记录时不能误报成功。 */
export const countLegacyInvitedMembers = async () =>
  connectionMongo.connection.db!.collection('team_members').countDocuments(legacyStatusFilter);
