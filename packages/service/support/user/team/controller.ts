import { type TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { type UpdateTeamProps } from '@fastgpt/global/support/user/team/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { TeamDefaultRoleVal } from '@fastgpt/global/support/permission/user/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { getTmbPermission } from '../../permission/controller';
import { getAIApi } from '../../../core/ai/config';
import { getS3AvatarSource } from '../../../common/s3/sources/avatar';
import { groupRepository, transactionRunner, teamRepository } from '../../../common/dal';
import type { TransactionContext } from '../../../common/dal';

type TeamMemberRelations = Awaited<ReturnType<typeof teamRepository.findMemberRelationsById>>;

/** 将 DAL 的成员、团队实体转换为 service 层历史使用的权限上下文。 */
const getTeamMember = async (relations: TeamMemberRelations): Promise<TeamTmbItemType> => {
  if (!relations?.team) return Promise.reject('member not exist');

  const { member, team } = relations;
  if (
    member.status === TeamMemberStatusEnum.leave ||
    member.status === TeamMemberStatusEnum.forbidden
  ) {
    return Promise.reject('member not exist');
  }

  const role =
    (await getTmbPermission({
      resourceType: PerResourceTypeEnum.team,
      teamId: member.teamId,
      tmbId: member.id
    })) ?? TeamDefaultRoleVal;
  const openaiAccount =
    team.openaiAccount?.key && team.openaiAccount.baseUrl ? team.openaiAccount : undefined;

  return {
    userId: member.userId,
    teamId: member.teamId,
    teamAvatar: team.avatar,
    teamName: team.name,
    memberName: member.name,
    avatar: member.avatar ?? '',
    balance: team.balance,
    tmbId: member.id,
    role: member.role as TeamTmbItemType['role'],
    status: member.status as TeamTmbItemType['status'],
    permission: new TeamPermission({
      role,
      isOwner: member.role === TeamMemberRoleEnum.owner
    }),
    notificationAccount: team.notificationAccount,
    openaiAccount,
    externalWorkflowVariables: team.externalWorkflowVariables,
    isWecomTeam: !!team.meta?.wecom
  };
};

export const getTeamOwner = (teamId: string) => teamRepository.findOwnerByTeamId(teamId);

export async function getTmbInfoByTmbId({ tmbId }: { tmbId: string }) {
  if (!tmbId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember(await teamRepository.findMemberRelationsById(tmbId));
}

export async function getUserDefaultTeam({ userId }: { userId: string }) {
  if (!userId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember(await teamRepository.findMemberRelationsByUserId(userId));
}

export async function createDefaultTeam({
  userId,
  teamName = 'My Team',
  avatar = '/icon/logo.svg',
  context
}: {
  userId: string;
  teamName?: string;
  avatar?: string;
  context?: TransactionContext;
}) {
  return teamRepository.createDefaultTeam({ userId, teamName, avatar, context });
}

export async function updateTeam({
  teamId,
  name,
  avatar,
  openaiAccount,
  externalWorkflowVariable
}: UpdateTeamProps & { teamId: string }) {
  if (openaiAccount?.key) {
    const normalizedOpenaiAccount = {
      ...openaiAccount,
      baseUrl: openaiAccount.baseUrl || 'https://api.openai.com/v1'
    };

    const { ai } = getAIApi({
      userKey: normalizedOpenaiAccount
    });

    const response = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }]
    });
    if (response?.choices?.[0]?.message?.content === undefined) {
      return Promise.reject('Key response is empty');
    }

    openaiAccount = normalizedOpenaiAccount;
  }

  const oldTeam = await teamRepository.findTeamById(teamId);
  await transactionRunner.withTransaction(async (context) => {
    await teamRepository.updateTeam(
      teamId,
      {
        name,
        avatar,
        openaiAccount: openaiAccount?.key ? openaiAccount : undefined,
        clearOpenaiAccount: openaiAccount?.key === '',
        externalWorkflowVariable
      },
      context
    );

    if (avatar) {
      await groupRepository.updateMemberGroupAvatar(teamId, DefaultGroupName, avatar, context);
    }
  });

  if (avatar) {
    await getS3AvatarSource().refreshAvatar(avatar, oldTeam?.avatar);
  }
}
