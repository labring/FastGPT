import { describe, expect, it } from 'vitest';
import { OpenAPIUserSchema } from '@fastgpt/global/openapi/support/user/account/login/api';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import {
  TeamDefaultRoleVal,
  TeamManageRoleVal
} from '@fastgpt/global/support/permission/user/constant';
import { replaceTeamCollaborators } from '@fastgpt/service/support/permission/resourcePermissionService';
import { Types, connectionMongo } from '@fastgpt/service/common/mongo';
import { cleanupTeamMemberRole } from '../../../../../../scripts/cleanup-team-member-role.mjs';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('getTmbInfoByTmbId', () => {
  it.each(
    ['owner', 'member', 'admin', '', null, undefined].flatMap((role) =>
      [undefined, TeamManageRoleVal].map((permission) => ({ role, permission }))
    )
  )(
    'returns cleaned role $role with unchanged permission $permission for token login',
    async ({ role, permission }) => {
      const user = await MongoUser.create({ username: 'legacy-role-user', password: 'test' });
      const team = await MongoTeam.create({ name: 'Legacy role team', ownerId: user._id });
      // 直接写入历史数据，避免当前 TypeScript 枚举掩盖真实数据库中的旧角色值。
      const { insertedId } = await MongoTeamMember.collection.insertOne({
        teamId: team._id,
        userId: user._id,
        name: 'Legacy member',
        status: 'active',
        ...(role !== undefined ? { role } : {})
      });
      const tmbId = String(insertedId);
      const isOwner = role === TeamMemberRoleEnum.owner;
      if (permission !== undefined) {
        await replaceTeamCollaborators({
          teamId: String(team._id),
          collaborators: [{ tmbId, permission }]
        });
      }

      const original = await MongoTeamMember.collection.findOne({ _id: insertedId });
      const needsCleanup = role !== undefined && !isOwner;
      expect(await cleanupTeamMemberRole(connectionMongo.connection.db)).toEqual({
        dryRun: true,
        before: needsCleanup ? 1 : 0,
        modified: 0,
        remaining: needsCleanup ? 1 : 0
      });
      expect(await MongoTeamMember.collection.findOne({ _id: insertedId })).toEqual(original);
      expect(await cleanupTeamMemberRole(connectionMongo.connection.db, { apply: true })).toEqual({
        dryRun: false,
        before: needsCleanup ? 1 : 0,
        modified: needsCleanup ? 1 : 0,
        remaining: 0
      });
      expect(await cleanupTeamMemberRole(connectionMongo.connection.db, { apply: true })).toEqual({
        dryRun: false,
        before: 0,
        modified: 0,
        remaining: 0
      });

      const member = await getTmbInfoByTmbId({ tmbId });

      expect(member.role).toBe(isOwner ? TeamMemberRoleEnum.owner : undefined);
      expect(member.permission.isOwner).toBe(isOwner);
      expect(member.permission.hasManagePer).toBe(isOwner || permission === TeamManageRoleVal);
      if (!isOwner) {
        expect(member.permission.role).toBe(permission ?? TeamDefaultRoleVal);
      }

      const detail = await getUserDetail({ tmbId });
      expect(OpenAPIUserSchema.safeParse(detail).success).toBe(true);
      const stored = await MongoTeamMember.collection.findOne({ _id: insertedId });
      const expectedStored = { ...original };
      if (needsCleanup) delete expectedStored.role;
      expect(stored).toEqual(expectedStored);
    }
  );

  it('still rejects an unknown member', async () => {
    await expect(getTmbInfoByTmbId({ tmbId: String(new Types.ObjectId()) })).rejects.toBe(
      'member not exist'
    );
  });
});
