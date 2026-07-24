import {
  AccountCancellationStatusEnum,
  accountCancellationActiveStatuses
} from '@fastgpt/global/support/user/account/cancellation/constants';
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

export const getActiveAccountCancellationByUserId = (userId?: string) => {
  if (!userId) return null;
  return MongoAccountCancellation.findOne({
    userId,
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

/** 批量读取团队 owner 的注销状态，避免团队列表产生逐条查询。 */
export const getActiveAccountCancellationsByTeamIds = async (teamIds: string[]) => {
  const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));
  if (uniqueTeamIds.length === 0) return [];

  const teams = await MongoTeam.find(
    { _id: { $in: uniqueTeamIds } },
    { _id: 1, ownerId: 1 }
  ).lean();
  const teamsWithOwners = teams.filter((team) => team.ownerId);
  const ownerIds = Array.from(new Set(teamsWithOwners.map((team) => String(team.ownerId))));
  if (ownerIds.length === 0) return [];

  const records = await MongoAccountCancellation.find({
    userId: { $in: ownerIds },
    status: accountCancellationActiveStatusFilter
  }).lean();
  const recordsByOwnerId = new Map(records.map((record) => [String(record.userId), record]));

  return teamsWithOwners.flatMap((team) => {
    const record = recordsByOwnerId.get(String(team.ownerId));
    return record ? [{ teamId: String(team._id), record }] : [];
  });
};

export const isAccountCancellationActiveStatus = (status?: string) =>
  status === AccountCancellationStatusEnum.pending ||
  status === AccountCancellationStatusEnum.finalizing;
