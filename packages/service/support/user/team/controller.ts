import { type TeamSchema, type TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import { type ClientSession, Types } from '../../../common/mongo';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum,
  notLeaveStatus
} from '@fastgpt/global/support/user/team/constant';
import { MongoTeamMember } from './teamMemberSchema';
import { MongoTeam } from './teamSchema';
import { type UpdateTeamProps } from '@fastgpt/global/support/user/team/controller';
import { getTmbPermission } from '../../permission/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { TeamDefaultRoleVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoMemberGroupModel } from '../../permission/memberGroup/memberGroupSchema';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { getAIApi } from '../../../core/ai/config';
import { createRootOrg } from '../../permission/org/controllers';
import { getS3AvatarSource } from '../../../common/s3/sources/avatar';
import { getLogger, LogCategories } from '../../../common/logger';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { TeamDefaultPermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { initTeamFreePlan } from '../../wallet/sub/utils';
import { getUserFallbackTeam } from './fallback';
import {
  assertAccountCancellationUserCanOwnTeam,
  formatTeamAccountCancellationSummary,
  getActiveAccountCancellationsByTeamIds
} from '../account/cancellation';
import { createTeamDefaultGroup } from '../../permission/memberGroup/teamDefaultGroup';
import { MongoUser } from '../schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

const logger = getLogger(LogCategories.MODULE.USER.TEAM);

/** 根据登录用户名生成与多团队默认团队一致的团队名称。 */
export const getUserDefaultTeamName = (username: string) => {
  const splitUsername = username.split('-');
  const formatUsername = splitUsername.length > 1 ? splitUsername.slice(1).join('-') : username;
  return `${formatUsername.slice(0, 10)} Team`;
};

async function getTeamMember(
  match: Record<string, any>,
  session?: ClientSession
): Promise<TeamTmbItemType> {
  const query = MongoTeamMember.findOne(match).populate<{ team: TeamSchema }>('team');
  if (session) query.session(session);
  const tmb = await query.lean();
  if (!tmb || !tmb.team || tmb.team.deleteTime) {
    return Promise.reject('member not exist');
  }

  const [[cancellation], roleResult, memberUser] = await Promise.all([
    getActiveAccountCancellationsByTeamIds([String(tmb.teamId)]),
    getTmbPermission({
      resourceType: PerResourceTypeEnum.team,
      teamId: tmb.teamId,
      tmbId: tmb._id,
      session
    }),
    MongoUser.findById(tmb.userId, 'username')
      .session(session ?? null)
      .lean()
  ]);

  const role = roleResult ?? TeamDefaultRoleVal;
  // root 代管租户团队时不写入持久化 role='owner' 以免污染团队真实 owner 查询，但在运行时权限中始终具备团队最高所有权。
  const isRootUser = memberUser?.username === 'root';
  const isOwner = tmb.role === TeamMemberRoleEnum.owner || isRootUser;

  return {
    userId: String(tmb.userId),
    teamId: String(tmb.teamId),
    teamAvatar: tmb.team.avatar,
    teamName: tmb.team.name,
    memberName: tmb.name,
    isSetMemberName: tmb.isSetMemberName ?? false,
    avatar: tmb.avatar,
    balance: tmb.team.balance,
    tmbId: String(tmb._id),
    role: tmb.role,
    status: tmb.status,
    permission: new TeamPermission({
      role,
      isOwner
    }),
    notificationAccount: tmb.team.notificationAccount,

    openaiAccount: tmb.team.openaiAccount,
    externalWorkflowVariables: tmb.team.externalWorkflowVariables,
    isWecomTeam: !!tmb.team.meta?.wecom,
    ...(cancellation
      ? {
          accountCancellation: formatTeamAccountCancellationSummary(cancellation.record)
        }
      : {})
  };
}

export const getTeamOwner = async (teamId: string) => {
  const tmb = await MongoTeamMember.findOne({
    teamId,
    role: TeamMemberRoleEnum.owner
  }).lean();
  return tmb;
};

export async function getTmbInfoByTmbId({
  tmbId,
  session
}: {
  tmbId: string;
  session?: ClientSession;
}) {
  if (!tmbId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember(
    {
      _id: new Types.ObjectId(String(tmbId)),
      status: notLeaveStatus
    },
    session
  );
}

export async function getUserDefaultTeam({
  userId,
  session
}: {
  userId: string;
  session?: ClientSession;
}) {
  if (!userId) {
    return Promise.reject('tmbId or userId is required');
  }
  return getTeamMember(
    {
      userId: new Types.ObjectId(userId),
      status: TeamMemberStatusEnum.active
    },
    session
  );
}

/**
 * 在登录事务中为没有任何可用团队的用户创建个人团队。
 * 调用方必须在覆盖完整登录事务生命周期的用户锁中调用；函数内部再次检查团队，
 * 避免已提交的团队被重复创建。
 */
export async function createUserLoginTeam({
  userId,
  username,
  memberName,
  memberAvatar,
  session
}: {
  userId: string;
  username: string;
  memberName?: string;
  memberAvatar?: string;
  session: ClientSession;
}) {
  await assertAccountCancellationUserCanOwnTeam(userId);

  const fallback = await getUserFallbackTeam({ userId, session });
  if (fallback) return fallback.tmbId;

  const [team] = await MongoTeam.create(
    [
      {
        ownerId: userId,
        name: getUserDefaultTeamName(username),
        avatar: LOGO_ICON,
        defaultPermission: TeamDefaultPermissionVal
      }
    ],
    { session, ordered: true }
  );
  const [tmb] = await MongoTeamMember.create(
    [
      {
        teamId: team._id,
        userId,
        name: memberName ?? username,
        // 登录兜底建队创建的是 owner，owner 不强制补齐成员名，回落写也记为已设置
        isSetMemberName: true,
        role: TeamMemberRoleEnum.owner,
        status: TeamMemberStatusEnum.active,
        avatar: memberAvatar ?? LOGO_ICON
      }
    ],
    { session, ordered: true }
  );

  // 兜底建队也按环境配置初始化全员组权限，并与登录事务一起提交或回滚。
  await createTeamDefaultGroup({ teamId: String(team._id), avatar: LOGO_ICON, session });
  await initTeamFreePlan({ teamId: String(team._id), session });
  await createRootOrg({ teamId: String(team._id), session });

  logger.info('Login fallback team created', {
    userId,
    teamId: team._id,
    tmbId: tmb._id
  });

  return String(tmb._id);
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
  const tmb = await MongoTeamMember.findOne(
    {
      userId: new Types.ObjectId(userId)
    },
    undefined,
    { session }
  );

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
    const [newMember] = await MongoTeamMember.create(
      [
        {
          teamId: insertedId,
          userId,
          name: 'Owner',
          // root/默认团队初始化规则不变：系统常量名视为已设置
          isSetMemberName: true,
          role: TeamMemberRoleEnum.owner,
          status: TeamMemberStatusEnum.active,
          createTime: new Date()
        }
      ],
      { session }
    );
    await createTeamDefaultGroup({ teamId: newMember.teamId, avatar, session });
    await createRootOrg({ teamId: newMember.teamId, session });
    logger.info('Default team created', { userId, teamId: newMember.teamId, tmbId: newMember._id });
    return newMember;
  } else {
    logger.info('Default team exists', { userId });
    return tmb;
  }
}

export async function updateTeam({
  teamId,
  name,
  avatar,
  openaiAccount,
  externalWorkflowVariable
}: UpdateTeamProps & { teamId: string }) {
  // auth openai key
  if (openaiAccount?.key) {
    const baseUrl = openaiAccount?.baseUrl || 'https://api.openai.com/v1';
    openaiAccount.baseUrl = baseUrl;

    const { ai } = getAIApi({
      userKey: openaiAccount
    });

    const response = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }]
    });
    if (response?.choices?.[0]?.message?.content === undefined) {
      return Promise.reject('Key response is empty');
    }
  }

  return mongoSessionRun(async (session) => {
    const unsetObj = (() => {
      const obj: Record<string, 1> = {};
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

    const setFields: Record<string, any> = {
      ...(name ? { name } : {}),
      ...(avatar ? { avatar } : {}),
      ...setObj
    };

    const updateQuery: Record<string, any> = {
      ...(Object.keys(setFields).length > 0 ? { $set: setFields } : {}),
      ...unsetObj
    };

    // This is where we get the old team
    const team =
      Object.keys(updateQuery).length > 0
        ? await MongoTeam.findByIdAndUpdate(teamId, updateQuery, { session })
        : await MongoTeam.findById(teamId).session(session);

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

      await getS3AvatarSource().refreshAvatar(avatar, team?.avatar, session);
    }
  });
}

/**
 * 为系统 root 用户在目标团队中按需（JIT）确保存在有效活跃成员记录。
 *
 * 设计约束：
 * 1. 仅当目标团队本身归 root 所有时保留 `role: 'owner'`；跨团队代管时不写 `role` 字段，
 *    避免污染 `getTeamOwner` 查询及破坏成员角色迁移约束。
 * 2. 直接跳过团队最大成员数（`maxTeamMember`）配额校验，且记录持久保留以维持历史资源外键完整性。
 * 3. 通过唯一索引 `{ userId: 1, teamId: 1 }` 配合并发冲突重试保证幂等。
 */
export async function ensureRootTeamMember({
  targetTeamId,
  rootUserId,
  session
}: {
  targetTeamId: string;
  rootUserId: string;
  session?: ClientSession;
}) {
  // 1. 校验目标团队存在且未被软删除。
  const teamQuery = MongoTeam.findOne(
    {
      _id: new Types.ObjectId(String(targetTeamId)),
      $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }]
    },
    { _id: 1, name: 1, ownerId: 1, avatar: 1 }
  );
  if (session) teamQuery.session(session);
  const targetTeam = await teamQuery.lean();
  if (!targetTeam) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  // 2. 原子 upsert root 在该团队的活跃成员锚点；并发首次插入命中 11000 时回退更新。
  const isOwnTeam = String(targetTeam.ownerId) === String(rootUserId);
  const filter = {
    teamId: targetTeam._id,
    userId: new Types.ObjectId(String(rootUserId))
  };
  const updateSet = {
    status: TeamMemberStatusEnum.active,
    ...(isOwnTeam ? { role: TeamMemberRoleEnum.owner } : {})
  };

  const tmb = await (async () => {
    try {
      return await MongoTeamMember.findOneAndUpdate(
        filter,
        {
          $set: updateSet,
          $setOnInsert: {
            name: 'root',
            avatar: LOGO_ICON,
            isSetMemberName: true,
            createTime: new Date()
          }
        },
        {
          upsert: true,
          new: true,
          ...(session ? { session } : {})
        }
      ).lean();
    } catch (error: any) {
      if (error?.code === 11000) {
        return MongoTeamMember.findOneAndUpdate(
          filter,
          { $set: updateSet },
          {
            new: true,
            ...(session ? { session } : {})
          }
        ).lean();
      }
      throw error;
    }
  })();

  if (!tmb) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  return {
    team: targetTeam,
    tmb
  };
}

/**
 * 统计团队实际占用的有效成员席位数。
 * 当 root 用户并非该团队真实所有者时，排除其跨团队代管产生的 JIT 成员记录，避免占用租户席位。
 */
export async function countEffectiveTeamMembers(teamId: string): Promise<number> {
  const [team, rootUser] = await Promise.all([
    MongoTeam.findById(teamId, 'ownerId').lean(),
    MongoUser.findOne({ username: 'root' }, '_id').lean()
  ]);

  const shouldExcludeRoot =
    Boolean(rootUser?._id) && String(team?.ownerId) !== String(rootUser?._id);

  return MongoTeamMember.countDocuments({
    teamId,
    status: { $ne: TeamMemberStatusEnum.leave },
    ...(shouldExcludeRoot ? { userId: { $ne: rootUser!._id } } : {})
  });
}

/**
 * 查询非 root 所属租户团队中的 root 代管成员信息，用于对普通租户成员隐藏 root 记录。
 * 若当前团队本就归 root 所有，返回 `null`（不隐藏）。
 */
export async function getForeignRootMemberInfo(teamId: string): Promise<{
  rootUserId: string;
  rootTmbId?: string;
  rootStatus?: string;
} | null> {
  const [team, rootUser] = await Promise.all([
    MongoTeam.findById(teamId, 'ownerId').lean(),
    MongoUser.findOne({ username: 'root' }, '_id').lean()
  ]);

  if (!rootUser?._id || String(team?.ownerId) === String(rootUser._id)) {
    return null;
  }

  const rootTmb = await MongoTeamMember.findOne(
    {
      teamId,
      userId: rootUser._id
    },
    '_id status'
  ).lean();

  return {
    rootUserId: String(rootUser._id),
    ...(rootTmb ? { rootTmbId: String(rootTmb._id), rootStatus: rootTmb.status } : {})
  };
}

/**
 * 校验待变更或删除的目标成员不包含系统 root 账号。
 * 租户任何成员（含租户原 Owner）均无权修改、降级、移除或将团队所有权强制变更给 root 成员。
 */
export async function assertTargetMemberNotRoot({
  tmbIds = [],
  userIds = []
}: {
  tmbIds?: string[];
  userIds?: string[];
}): Promise<void> {
  const validTmbIds = tmbIds.filter((id) => Types.ObjectId.isValid(id));
  const validUserIds = userIds.filter((id) => Types.ObjectId.isValid(id));
  if (validTmbIds.length === 0 && validUserIds.length === 0) return;

  const rootUser = await MongoUser.findOne({ username: 'root' }, '_id').lean();
  if (!rootUser?._id) return;

  const rootUserIdStr = String(rootUser._id);
  if (validUserIds.some((uid) => String(uid) === rootUserIdStr)) {
    return Promise.reject(TeamErrEnum.unPermission);
  }

  if (validTmbIds.length > 0) {
    const matchedRootMember = await MongoTeamMember.exists({
      _id: { $in: validTmbIds.map((id) => new Types.ObjectId(id)) },
      userId: rootUser._id
    });
    if (matchedRootMember) {
      return Promise.reject(TeamErrEnum.unPermission);
    }
  }
}
