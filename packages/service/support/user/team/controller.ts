import { TeamSchema, TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import { ClientSession, Types } from '../../../common/mongo';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum,
  notLeaveStatus
} from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from './teamMemberSchema';
import { MongoTeam } from './teamSchema';
import { UpdateTeamProps } from '@fastgpt/global/support/user/team/controller';
import { getResourcePermission } from '../../permission/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { TeamDefaultPermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoMemberGroupModel } from '../../permission/memberGroup/memberGroupSchema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { getAIApi, openaiBaseUrl } from '../../../core/ai/config';
import { createRootOrg } from '../../permission/org/controllers';
import { refreshSourceAvatar } from '../../../common/file/image/controller';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { getGroupsByTmbId } from '../../../support/permission/memberGroup/controllers';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { MongoGroupMemberModel } from '../../../support/permission/memberGroup/groupMemberSchema';
import { MongoOrgMemberModel } from '../../../support/permission/org/orgMemberSchema';
import { changeOwner } from '../../../core/changeOwner';

async function getTeamMember(match: Record<string, any>): Promise<TeamTmbItemType> {
  const tmb = await MongoTeamMember.findOne(match).populate<{ team: TeamSchema }>('team').lean();
  if (!tmb) {
    return Promise.reject('member not exist');
  }

  const Per = await getResourcePermission({
    resourceType: PerResourceTypeEnum.team,
    teamId: tmb.teamId,
    tmbId: tmb._id
  });

  return {
    userId: String(tmb.userId),
    teamId: String(tmb.teamId),
    teamAvatar: tmb.team.avatar,
    teamName: tmb.team.name,
    memberName: tmb.name,
    avatar: tmb.team.avatar,
    balance: tmb.team.balance,
    tmbId: String(tmb._id),
    teamDomain: tmb.team?.teamDomain,
    role: tmb.role,
    status: tmb.status,
    defaultTeam: tmb.defaultTeam,
    permission: new TeamPermission({
      per: Per ?? TeamDefaultPermissionVal,
      isOwner: tmb.role === TeamMemberRoleEnum.owner
    }),
    notificationAccount: tmb.team.notificationAccount,

    lafAccount: tmb.team.lafAccount,
    openaiAccount: tmb.team.openaiAccount,
    externalWorkflowVariables: tmb.team.externalWorkflowVariables
  };
}

export async function getTmbInfoByTmbId({ tmbId }: { tmbId: string }) {
  if (!tmbId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember({
    _id: new Types.ObjectId(String(tmbId)),
    status: notLeaveStatus
  });
}

export async function getUserDefaultTeam({ userId }: { userId: string }) {
  if (!userId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });
}

export async function createDefaultTeam({
  userId,
  teamName = 'My Team',
  avatar = '/icon/logo.svg',
  session
}: {
  userId: string;
  teamName?: string;
  avatar?: string;
  session: ClientSession;
}) {
  // auth default team
  const tmb = await MongoTeamMember.findOne({
    userId: new Types.ObjectId(userId),
    defaultTeam: true
  });

  if (!tmb) {
    // create team
    const [{ _id: insertedId }] = await MongoTeam.create(
      [
        {
          ownerId: userId,
          name: teamName,
          avatar,
          createTime: new Date()
        }
      ],
      { session }
    );
    // create team member
    const [tmb] = await MongoTeamMember.create(
      [
        {
          teamId: insertedId,
          userId,
          name: 'Owner',
          role: TeamMemberRoleEnum.owner,
          status: TeamMemberStatusEnum.active,
          createTime: new Date(),
          defaultTeam: true
        }
      ],
      { session }
    );
    // create default group
    await MongoMemberGroupModel.create(
      [
        {
          teamId: tmb.teamId,
          name: DefaultGroupName,
          avatar
        }
      ],
      { session }
    );
    await createRootOrg({ teamId: tmb.teamId, session });
    console.log('create default team, group and root org', userId);
    return tmb;
  } else {
    console.log('default team exist', userId);
  }
}

export async function updateTeam({
  teamId,
  name,
  avatar,
  teamDomain,
  lafAccount,
  openaiAccount,
  externalWorkflowVariable
}: UpdateTeamProps & { teamId: string }) {
  // auth openai key
  if (openaiAccount?.key) {
    console.log('auth user openai key', openaiAccount?.key);
    const baseUrl = openaiAccount?.baseUrl || openaiBaseUrl;
    openaiAccount.baseUrl = baseUrl;

    const ai = getAIApi({
      userKey: openaiAccount
    });

    const response = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }]
    });
    if (response?.choices?.[0]?.message?.content === undefined) {
      return Promise.reject('Key response is empty');
    }
  }

  return mongoSessionRun(async (session) => {
    const unsetObj = (() => {
      const obj: Record<string, 1> = {};
      if (lafAccount?.pat === '') {
        obj.lafAccount = 1;
      }
      if (openaiAccount?.key === '') {
        obj.openaiAccount = 1;
      }
      if (externalWorkflowVariable) {
        if (externalWorkflowVariable.value === '') {
          obj[`externalWorkflowVariables.${externalWorkflowVariable.key}`] = 1;
        }
      }

      if (Object.keys(obj).length === 0) {
        return undefined;
      }
      return {
        $unset: obj
      };
    })();
    const setObj = (() => {
      const obj: Record<string, any> = {};
      if (lafAccount?.pat && lafAccount?.appid) {
        obj.lafAccount = lafAccount;
      }
      if (openaiAccount?.key && openaiAccount?.baseUrl) {
        obj.openaiAccount = openaiAccount;
      }
      if (externalWorkflowVariable) {
        if (externalWorkflowVariable.value !== '') {
          obj[`externalWorkflowVariables.${externalWorkflowVariable.key}`] =
            externalWorkflowVariable.value;
        }
      }
      if (Object.keys(obj).length === 0) {
        return undefined;
      }
      return obj;
    })();

    // This is where we get the old team
    const team = await MongoTeam.findByIdAndUpdate(
      teamId,
      {
        $set: {
          ...(name ? { name } : {}),
          ...(avatar ? { avatar } : {}),
          ...(teamDomain ? { teamDomain } : {}),
          ...setObj
        },
        ...unsetObj
      },
      { session }
    );

    // Update member group avatar
    if (avatar) {
      await MongoMemberGroupModel.updateOne(
        {
          teamId: teamId,
          name: DefaultGroupName
        },
        {
          avatar
        },
        { session }
      );

      await refreshSourceAvatar(avatar, team?.avatar, session);
    }
  });
}

/** remove user from team */
export async function removeUser({
  teamId,
  memberId,
  session
}: {
  teamId: string;
  memberId: string;
  session?: ClientSession;
}) {
  const removeTmb = await MongoTeamMember.findOne(
    {
      teamId,
      _id: memberId
    },
    undefined,
    { session }
  );
  if (!removeTmb) {
    return Promise.reject('member not exist');
  }

  const ownerTmb = await MongoTeamMember.findOne(
    {
      teamId,
      role: TeamMemberRoleEnum.owner
    },
    undefined,
    { session }
  );
  if (!ownerTmb) {
    return Promise.reject('owner not exist');
  }

  const memberTmbId = String(memberId);
  const teamOwnerTmbId = String(ownerTmb._id);

  if (teamOwnerTmbId === memberTmbId) {
    return Promise.reject('owner can not be deleted');
  }

  // Transfer source
  const func = async (session: ClientSession) => {
    // Delete permission
    await MongoResourcePermission.deleteMany(
      {
        resourceType: { $exists: true },
        teamId,
        tmbId: memberTmbId
      },
      { session }
    );

    // Transfer group to team owner
    const groups = await getGroupsByTmbId({
      tmbId: memberTmbId,
      teamId,
      role: [GroupMemberRole.owner]
    });
    // update group member owner
    await MongoGroupMemberModel.updateMany(
      {
        groupId: { $in: groups.map((group) => String(group._id)) },
        tmbId: teamOwnerTmbId
      },
      {
        role: GroupMemberRole.owner
      },
      {
        upsert: true,
        session
      }
    );
    // Delete group member
    await MongoGroupMemberModel.deleteMany(
      {
        tmbId: memberTmbId
      },
      { session }
    );

    // Delete org member
    await MongoOrgMemberModel.deleteMany(
      {
        teamId,
        tmbId: memberTmbId
      },
      { session }
    );

    // Transfer permission
    await changeOwner({
      teamId,
      changeOwnerType: 'app',
      newOwnerId: teamOwnerTmbId,
      oldOwnerId: memberTmbId,
      session
    });

    await changeOwner({
      teamId,
      changeOwnerType: 'dataset',
      newOwnerId: teamOwnerTmbId,
      oldOwnerId: memberTmbId,
      session
    });

    // Update member status is leave
    removeTmb.status = TeamMemberStatusEnum.leave;
    await removeTmb.save({ session });
  };

  if (session) {
    await func(session);
  } else {
    await mongoSessionRun(func);
  }
}
