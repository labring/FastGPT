import {
  AccountCancellationStatus,
  accountCancellationActiveStatuses
} from '@fastgpt/global/support/user/account/cancellation/constants';
import { Types } from 'mongoose';
import { MongoTeam } from '../../team/teamSchema';
import { MongoAccountCancellation, type AccountCancellationSchemaType } from './schema';

export const accountCancellationActiveStatusFilter = {
  $in: accountCancellationActiveStatuses
} as const;

export const getAccountCancellationByUserId = (userId?: string) => {
  if (!userId) return null;
  return MongoAccountCancellation.findOne({ userId }).lean();
};

export const getActiveAccountCancellationByUserId = (userId?: string) => {
  if (!userId) return null;
  return MongoAccountCancellation.findOne({
    userId,
    status: accountCancellationActiveStatusFilter
  }).lean();
};

/** 一次读取当前成员本人和当前团队 owner 的 active 注销记录，供中心鉴权复用。 */
export const getActiveAccountCancellationsByUserIds = async ({
  userId,
  ownerId
}: {
  userId: string;
  ownerId?: string;
}) => {
  const userIds = Array.from(new Set([userId, ownerId].filter(Boolean)));
  return MongoAccountCancellation.find({
    userId: { $in: userIds },
    status: accountCancellationActiveStatusFilter
  }).lean();
};

/**
 * 通过团队当前 owner 动态关联注销记录，生命周期集合不保存 ownerTeamIds 快照。
 */
export const getActiveAccountCancellationByTeamId = async (teamId?: string) => {
  if (!teamId || !Types.ObjectId.isValid(teamId)) return null;
  const team = await MongoTeam.findById(teamId, { ownerId: 1 }).lean();
  if (!team?.ownerId) return null;

  return MongoAccountCancellation.findOne({
    userId: team.ownerId,
    status: accountCancellationActiveStatusFilter
  }).lean();
};

/**
 * 批量读取已查询团队 owner 的注销状态，避免 fallback 为了注销检查重复读取团队。
 * knownCancellations 用于复用调用方已经读取的 owner 注销记录。
 */
export const getActiveAccountCancellationsByTeams = async (
  teams: { _id: unknown; ownerId?: unknown }[],
  knownCancellations: Pick<
    AccountCancellationSchemaType,
    'userId' | 'status' | 'requestedAt'
  >[] = []
) => {
  const teamsWithOwners = teams.filter((team) => team.ownerId);
  const ownerIds = Array.from(new Set(teamsWithOwners.map((team) => String(team.ownerId))));
  const knownByOwnerId = new Map(
    knownCancellations.map((record) => [String(record.userId), record])
  );
  const ownerIdsToQuery = ownerIds.filter((ownerId) => !knownByOwnerId.has(ownerId));

  const records =
    ownerIdsToQuery.length > 0
      ? await MongoAccountCancellation.find({
          userId: { $in: ownerIdsToQuery },
          status: accountCancellationActiveStatusFilter
        }).lean()
      : [];
  const recordsByOwnerId = new Map([
    ...knownByOwnerId,
    ...records.map((record) => [String(record.userId), record] as const)
  ]);

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

export const isAccountCancellationActiveStatus = (status?: string) =>
  status === AccountCancellationStatus.pending || status === AccountCancellationStatus.finalizing;
