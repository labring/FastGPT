import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { Types } from '@fastgpt/service/common/mongo';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  GetLogUsersBodySchema,
  GetLogUsersResponseSchema,
  type LogUserType,
  type GetLogUsersResponse
} from '@fastgpt/global/openapi/core/app/log/api';
import { DEFAULT_USER_AVATAR } from '@fastgpt/global/common/system/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamMemberDisplayIdentityMap } from '@fastgpt/service/support/user/team/memberDisplay';

type LogUserGroup = {
  _id: string;
  count: number;
};

type LogUserAggregationResult = {
  list: LogUserGroup[];
  total: Array<{ count: number }>;
};

/**
 * 从应用聚合日志中按用户统计会话数；用户名搜索先转换为团队成员 ID，再执行聚合和分页。
 */
async function handler(req: ApiRequestProps): Promise<GetLogUsersResponse> {
  const {
    body: { appId, dateStart, dateEnd, searchKey, sources, pageSize, pageNum, offset }
  } = parseApiInput({
    req,
    bodySchema: GetLogUsersBodySchema
  });

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { teamId } = await authApp({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    per: AppReadChatLogPerVal
  });

  const resolvedPageSize = Math.max(1, pageSize ?? 50);
  const resolvedOffset = Math.max(0, offset ?? ((pageNum ?? 1) - 1) * resolvedPageSize);
  const teamObjectId = new Types.ObjectId(teamId);
  const searchPattern = searchKey?.trim()
    ? new RegExp(replaceRegChars(searchKey.trim()), 'i')
    : undefined;

  // 成员名可能是待补齐占位值；用户名和联系方式保存在 users，需要先限定当前团队成员，再解析回 tmbId，避免扫描全局 users 集合。
  const matchedTeamMemberIds = searchPattern
    ? await (async () => {
        const teamMemberUsers = await MongoTeamMember.find(
          { teamId: teamObjectId },
          'userId'
        ).lean();
        const teamUserIds = teamMemberUsers.map((member) => member.userId);
        const matchedUsers = teamUserIds.length
          ? await MongoUser.find(
              {
                _id: { $in: teamUserIds },
                $or: [{ username: searchPattern }, { contact: searchPattern }]
              },
              '_id'
            ).lean()
          : [];
        return MongoTeamMember.find(
          {
            teamId: teamObjectId,
            $or: [
              { name: searchPattern },
              ...(matchedUsers.length
                ? [{ userId: { $in: matchedUsers.map((user) => user._id) } }]
                : [])
            ]
          },
          '_id'
        ).lean();
      })()
    : [];
  const userMatch = searchPattern
    ? {
        $or: [
          { userId: searchPattern },
          ...(matchedTeamMemberIds.length
            ? [{ userId: { $in: matchedTeamMemberIds.map((item) => String(item._id)) } }]
            : [])
        ]
      }
    : {};

  const [aggregateResult] = await MongoAppChatLog.aggregate<LogUserAggregationResult>(
    [
      {
        $match: {
          teamId: teamObjectId,
          appId: new Types.ObjectId(appId),
          updateTime: {
            $gte: new Date(dateStart),
            $lte: new Date(dateEnd)
          },
          userId: { $exists: true, $nin: [null, ''] },
          ...(sources?.length && { source: { $in: sources } }),
          ...userMatch
        }
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 }
        }
      },
      {
        $facet: {
          list: [
            { $sort: { count: -1, _id: 1 } },
            { $skip: resolvedOffset },
            { $limit: resolvedPageSize }
          ],
          total: [{ $count: 'count' }]
        }
      }
    ],
    { ...readFromSecondary }
  );

  const userGroups = aggregateResult?.list ?? [];
  const total = aggregateResult?.total?.[0]?.count ?? 0;
  const userIds = userGroups.map((item) => String(item._id));
  const memberDisplayMap = await getTeamMemberDisplayIdentityMap({
    teamId,
    tmbIds: userIds.filter((id) => Types.ObjectId.isValid(id))
  });

  const list = userGroups.map((item): LogUserType => {
    const userId = String(item._id);
    const member = memberDisplayMap.get(userId);
    return {
      outLinkUid: member ? null : userId,
      tmbId: member ? userId : null,
      name: member?.name || userId,
      avatar: member?.avatar || DEFAULT_USER_AVATAR,
      count: item.count
    };
  });

  return GetLogUsersResponseSchema.parse({
    list,
    total
  });
}

export default NextAPI(handler);
