import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { UserStatusEnum } from '@fastgpt/global/support/user/constant';

export type GetUserListQuery = PaginationProps<{
  searchKey?: string;
  status?: `${UserStatusEnum}`;
  teamId?: string;
}>;

export type UserListItemType = {
  _id: string;
  username: string;
  status: `${UserStatusEnum}`;
  createTime: Date;
  lastLoginTime?: Date;
  promotionRate: number;
  timezone: string;
  teams: {
    teamId: string;
    teamName: string;
    role: string;
    status: string;
  }[];
  totalTeams: number;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const {
      searchKey = '',
      status,
      teamId,
      current: currentStr = '1',
      pageSize: pageSizeStr = '20'
    } = req.query as any;

    // 转换为数字类型
    const current = parseInt(currentStr as string, 10) || 1;
    const pageSize = parseInt(pageSizeStr as string, 10) || 20;

    // 验证管理员权限
    await authAdmin(req);

    // 构建查询条件
    const match: any = {};

    if (searchKey) {
      match.username = { $regex: searchKey, $options: 'i' };
    }

    if (status) {
      match.status = status;
    }

    // 计算分页
    const skip = (current - 1) * pageSize;

    // 聚合查询用户和团队信息
    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'team_members',
          localField: '_id',
          foreignField: 'userId',
          as: 'teamMembers'
        }
      },
      {
        $lookup: {
          from: 'teams',
          localField: 'teamMembers.teamId',
          foreignField: '_id',
          as: 'teams'
        }
      },
      {
        $addFields: {
          totalTeams: { $size: '$teamMembers' },
          teamInfo: {
            $map: {
              input: '$teamMembers',
              as: 'member',
              in: {
                teamId: '$$member.teamId',
                role: '$$member.role',
                status: '$$member.status',
                teamName: {
                  $arrayElemAt: [
                    {
                      $map: {
                        input: {
                          $filter: {
                            input: '$teams',
                            cond: { $eq: ['$$this._id', '$$member.teamId'] }
                          }
                        },
                        in: '$$this.name'
                      }
                    },
                    0
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          username: 1,
          status: 1,
          createTime: 1,
          promotionRate: 1,
          timezone: 1,
          teams: '$teamInfo',
          totalTeams: 1
        }
      },
      { $sort: { createTime: -1 as const } },
      { $skip: skip },
      { $limit: pageSize }
    ];

    // 如果指定了团队ID，添加团队过滤
    if (teamId) {
      pipeline.unshift({
        $lookup: {
          from: 'team_members',
          localField: '_id',
          foreignField: 'userId',
          as: 'teamFilter'
        }
      });
      pipeline.unshift({
        $match: {
          'teamFilter.teamId': teamId
        }
      });
    }

    const [users, totalCount] = await Promise.all([
      MongoUser.aggregate(pipeline),
      MongoUser.countDocuments(match)
    ]);

    return jsonRes(res, {
      data: {
        list: users,
        total: totalCount,
        current,
        pageSize
      }
    });
  } catch (err) {
    console.error(err);
    return jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default handler;
