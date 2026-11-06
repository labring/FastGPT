import type { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { MongoOrgModel } from '../../../permission/org/orgSchema';
import { MongoOrgMemberModel } from '../../../permission/org/orgMemberSchema';
import { MongoMemberGroupModel } from '../../../permission/memberGroup/memberGroupSchema';
import { MongoGroupMemberModel } from '../../../permission/memberGroup/groupMemberSchema';
import { MongoTeamMember } from '../../../user/team/teamMemberSchema';
import { MongoTeam } from '../../../user/team/teamSchema';
import { Types } from '../../../../common/mongo';

/** 从主库读取本团队选中的群组；不存在或其他团队的 ID 不会返回。 */
export const findUsageGroupsByIds = ({ teamId, ids }: { teamId: string; ids: string[] }) =>
  MongoMemberGroupModel.find({ teamId, _id: { $in: ids } })
    .read('primary')
    .lean();

/** 只读取已由上层确认归属的群组关系；成员的团队交集由业务层校验。 */
export const findUsageGroupMembers = (groupIds: string[]) =>
  MongoGroupMemberModel.find({ groupId: { $in: groupIds } })
    .select('tmbId')
    .read('primary')
    .lean();

/** 读取本团队的当前组织树资料，不创建或补齐根组织。 */
export const findUsageDepartments = (teamId: string) =>
  MongoOrgModel.find({ teamId }).select('_id path pathId name avatar').read('primary').lean();

/** 读取本团队所选部门的成员关系；脏关系中的成员仍须由上层求团队交集。 */
export const findUsageDepartmentMembers = ({
  teamId,
  orgIds
}: {
  teamId: string;
  orgIds: string[];
}) =>
  MongoOrgMemberModel.find({ teamId, orgId: { $in: orgIds } })
    .select('tmbId')
    .read('primary')
    .lean();

/** 按状态和 ID 稳定分页读取成员；计数与列表使用相同查询条件。 */
export const findUsageMemberOptions = async ({
  teamId,
  name,
  offset,
  pageSize
}: {
  teamId: string;
  name?: RegExp;
  offset: number;
  pageSize: number;
}) => {
  const where = { teamId: new Types.ObjectId(teamId), ...(name ? { name } : {}) };
  const [members, total] = await Promise.all([
    MongoTeamMember.aggregate<TeamMemberSchema>([
      { $match: where },
      {
        $addFields: {
          statusOrder: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'active'] }, then: 1 },
                { case: { $eq: ['$status', 'leave'] }, then: 2 },
                { case: { $eq: ['$status', 'forbidden'] }, then: 3 }
              ],
              default: 4
            }
          }
        }
      },
      { $sort: { statusOrder: 1, _id: 1 } },
      { $skip: offset },
      { $limit: pageSize }
    ]).read('primary'),
    MongoTeamMember.countDocuments(where).read('primary')
  ]);
  return { members, total };
};

/** 按 ID 稳定分页读取群组；展示名称到内部名称的搜索转换由上层完成。 */
export const findUsageGroupOptions = async ({
  teamId,
  name,
  offset,
  pageSize
}: {
  teamId: string;
  name?: RegExp | { $in: (RegExp | string)[] };
  offset: number;
  pageSize: number;
}) => {
  const where = { teamId, ...(name ? { name } : {}) };
  const [groups, total] = await Promise.all([
    MongoMemberGroupModel.find(where)
      .sort({ _id: 1 })
      .skip(offset)
      .limit(pageSize)
      .read('primary')
      .lean(),
    MongoMemberGroupModel.countDocuments(where).read('primary')
  ]);
  return { groups, total };
};

/** 只读取当前团队名称，用于组织目录展示。 */
export const findUsageTeam = (teamId: string) =>
  MongoTeam.findById(teamId).select('name').read('primary').lean();
