import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { Types } from '@fastgpt/service/common/mongo';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  GetLogUsersBodySchema,
  type LogUserType,
  type GetLogUsersResponse
} from '@fastgpt/global/openapi/core/app/log/api';
import { DEFAULT_USER_AVATAR } from '@fastgpt/global/common/system/constants';

async function handler(req: ApiRequestProps, _res: NextApiResponse): Promise<GetLogUsersResponse> {
  const { appId, dateStart, dateEnd, searchKey, sources } = GetLogUsersBodySchema.parse(req.body);

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: AppReadChatLogPerVal
  });

  const aggregateResult = await MongoChat.aggregate(
    [
      {
        $match: {
          appId: new Types.ObjectId(appId),
          updateTime: {
            $gte: new Date(dateStart),
            $lte: new Date(dateEnd)
          },
          ...(sources?.length && { source: { $in: sources } })
        }
      },
      {
        $group: {
          _id: {
            outLinkUid: '$outLinkUid',
            tmbId: '$tmbId'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 100 }
    ],
    { ...readFromSecondary }
  );

  const tmbIds = aggregateResult
    .filter((item) => item._id.tmbId && !item._id.outLinkUid)
    .map((item) => item._id.tmbId);

  const teamMembers = tmbIds.length
    ? await MongoTeamMember.find(
        {
          _id: { $in: tmbIds },
          teamId: new Types.ObjectId(teamId)
        },
        '_id name avatar'
      ).lean()
    : [];

  const tmbMap = new Map(teamMembers.map((m) => [String(m._id), m]));

  const searchPattern = searchKey ? new RegExp(replaceRegChars(searchKey), 'i') : null;

  const list = aggregateResult
    .map((item): LogUserType => {
      const outLinkUid = item._id.outLinkUid || null;
      const tmbId = item._id.tmbId ? String(item._id.tmbId) : null;

      const { name, avatar } = (() => {
        if (outLinkUid) {
          return { name: outLinkUid, avatar: DEFAULT_USER_AVATAR };
        }
        if (tmbId) {
          const member = tmbMap.get(tmbId);
          return { name: member?.name || tmbId, avatar: member?.avatar };
        }
        return { name: '-', avatar: DEFAULT_USER_AVATAR };
      })();

      return { outLinkUid, tmbId, name, avatar, count: item.count };
    })
    .filter((item) => !searchPattern || searchPattern.test(item.name))
    .slice(0, 50);

  return { list };
}

export default NextAPI(handler);
