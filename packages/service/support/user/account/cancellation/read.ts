import { accountCancellationActiveStatuses } from '@fastgpt/global/support/user/account/cancellation/constants';
import { accountCancellationCache } from '@fastgpt/dal/redis/caches';
import { Types } from 'mongoose';
import { MongoTeam } from '../../team/teamSchema';
import { MongoAccountCancellation } from './schema';

export const accountCancellationActiveStatusFilter = {
  $in: accountCancellationActiveStatuses
} as const;

export const getAccountCancellationByUserId = (userId?: string) => {
  if (!userId) return null;
  return MongoAccountCancellation.findOne({ userId }).lean();
};

/** 读取用户 active 注销记录；inactive Cache 命中时直接返回，active 命中仍需回源获取完整记录。 */
export const getActiveAccountCancellationByUserId = async (userId?: string) => {
  if (!userId) return null;

  const cachedCancellation = await accountCancellationCache.get('user', userId);
  if (cachedCancellation === false) return null;

  const cancellation = await MongoAccountCancellation.findOne({
    userId,
    status: accountCancellationActiveStatusFilter
  }).lean();

  if (cachedCancellation === undefined) {
    await accountCancellationCache.setIfAbsent('user', userId, !!cancellation);
  }

  return cancellation;
};

/**
 * 通过团队当前 owner 动态关联注销记录，生命周期集合不保存 ownerTeamIds 快照。
 * inactive Cache 命中时直接返回，active 命中仍需回源获取完整记录。
 */
export const getActiveAccountCancellationByTeamId = async (teamId?: string) => {
  if (!teamId || !Types.ObjectId.isValid(teamId)) return null;

  const cachedCancellation = await accountCancellationCache.get('team', teamId);
  if (cachedCancellation === false) return null;

  const team = await MongoTeam.findById(teamId, { ownerId: 1 }).lean();
  if (!team?.ownerId) {
    if (cachedCancellation === undefined) {
      await accountCancellationCache.setIfAbsent('team', teamId, false);
    }
    return null;
  }

  const cancellation = await MongoAccountCancellation.findOne({
    userId: team.ownerId,
    status: accountCancellationActiveStatusFilter
  }).lean();

  if (cachedCancellation === undefined) {
    await accountCancellationCache.setIfAbsent('team', teamId, !!cancellation);
  }

  return cancellation;
};

/** 批量读取已查询团队 owner 的注销状态，避免 fallback 为了注销检查重复读取团队。 */
export const getActiveAccountCancellationsByTeams = async (
  teams: { _id: unknown; ownerId?: unknown }[]
) => {
  const teamsWithOwners = teams.filter((team) => team.ownerId);
  const ownerIds = Array.from(new Set(teamsWithOwners.map((team) => String(team.ownerId))));

  const records =
    ownerIds.length > 0
      ? await MongoAccountCancellation.find({
          userId: { $in: ownerIds },
          status: accountCancellationActiveStatusFilter
        }).lean()
      : [];
  const recordsByOwnerId = new Map(
    records.map((record) => [String(record.userId), record] as const)
  );

  return teamsWithOwners.flatMap((team) => {
    const record = recordsByOwnerId.get(String(team.ownerId));
    return record ? [{ teamId: String(team._id), record }] : [];
  });
};

/** 批量读取团队 owner 的注销状态，供只持有团队 ID 的调用方使用。 */
export const getActiveAccountCancellationsByTeamIds = async (teamIds: string[]) => {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));
  if (uniqueTeamIds.length === 0) return [];

  const teams = await MongoTeam.find(
    { _id: { $in: uniqueTeamIds } },
    { _id: 1, ownerId: 1 }
  ).lean();

  return getActiveAccountCancellationsByTeams(teams);
};
