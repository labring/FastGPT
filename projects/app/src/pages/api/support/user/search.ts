import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { MongoMemberGroupModel } from '@fastgpt/service/support/permission/memberGroup/memberGroupSchema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

type ResultType = 'member' | 'org' | 'group';
type SearchResult = {
  id: string;
  type: `${ResultType}`;
  name: string;
  avatar: string;
};

export type SearchQuery = {
  searchKey: string;
};
export type SearchBody = {};
export type SearchResponse = SearchResult[];

/** 用户搜索接口
 * @param searchKey 关键词 可以通过 userId, memberName, contact 搜索
 * */
async function handler(
  req: ApiRequestProps<SearchBody, SearchQuery>,
  _res: ApiResponseType<any>
): Promise<SearchResponse> {
  const { searchKey } = req.query;
  const { teamId } = await authUserPer({ req, authToken: true, per: ReadPermissionVal });
  if (!searchKey) {
    return [];
  }
  const regex = new RegExp(searchKey, 'i');

  const members = await MongoTeamMember.find({
    name: regex,
    teamId
  })
    .limit(10)
    .lean();

  const users = await MongoUser.find({
    $or: [
      { username: regex },
      {
        contact: {
          $exists: true,
          $regex: regex
        }
      }
    ]
  })
    .limit(10)
    .lean();

  const orgs = await MongoOrgModel.find({
    name: regex,
    teamId
  })
    .limit(10)
    .lean();

  const groups = await MongoMemberGroupModel.find({
    name: regex,
    teamId
  })
    .limit(10)
    .lean();

  // find users who are not in members but in users
  const extraMembers = await (async () => {
    const memberUserIds = members.map((member) => String(member.userId));
    const extraUsers = users.filter((user) => !memberUserIds.includes(String(user._id)));
    return await MongoTeamMember.find({
      userId: {
        $in: extraUsers.map((user) => String(user._id))
      },
      teamId
    }).lean();
  })();

  return [
    ...[...members, ...extraMembers].map(
      (member) =>
        ({
          id: String(member._id),
          type: 'member',
          name: member.name,
          avatar: member.avatar
        }) as SearchResult
    ),
    ...orgs.map(
      (org) =>
        ({
          id: String(org._id),
          type: 'org',
          name: org.name,
          avatar: org.avatar
        }) as SearchResult
    ),
    ...groups.map(
      (group) =>
        ({
          id: String(group._id),
          type: 'group',
          name: group.name,
          avatar: group.avatar
        }) as SearchResult
    )
  ];
}
export default NextAPI(handler);
