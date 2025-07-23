import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';

export type UserStatsResponse = {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  bannedUsers: number;
  totalTeams: number;
  totalApps: number;
  totalDatasets: number;
  recentRegistrations: {
    date: string;
    count: number;
  }[];
  usersByStatus: {
    status: string;
    count: number;
  }[];
  topTeamsByMembers: {
    teamId: string;
    teamName: string;
    memberCount: number;
  }[];
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    // 验证管理员权限
    await authAdmin(req);

    // 获取基础统计数据
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      bannedUsers,
      totalTeams,
      totalApps,
      totalDatasets
    ] = await Promise.all([
      MongoUser.countDocuments(),
      MongoUser.countDocuments({ status: UserStatusEnum.active }),
      MongoUser.countDocuments({ status: UserStatusEnum.inactive }),
      MongoUser.countDocuments({ status: UserStatusEnum.forbidden }),
      MongoTeam.countDocuments(),
      MongoApp.countDocuments(),
      MongoDataset.countDocuments()
    ]);

    // 获取最近30天的注册统计
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRegistrations = await MongoUser.aggregate([
      {
        $match: {
          createTime: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createTime'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          date: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // 获取用户状态分布
    const usersByStatus = await MongoUser.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // 获取成员数最多的团队
    const topTeamsByMembers = await MongoTeamMember.aggregate([
      {
        $group: {
          _id: '$teamId',
          memberCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'teams',
          localField: '_id',
          foreignField: '_id',
          as: 'team'
        }
      },
      {
        $unwind: '$team'
      },
      {
        $project: {
          teamId: '$_id',
          teamName: '$team.name',
          memberCount: 1,
          _id: 0
        }
      },
      {
        $sort: { memberCount: -1 }
      },
      {
        $limit: 10
      }
    ]);

    const stats: UserStatsResponse = {
      totalUsers,
      activeUsers,
      inactiveUsers,
      bannedUsers,
      totalTeams,
      totalApps,
      totalDatasets,
      recentRegistrations,
      usersByStatus,
      topTeamsByMembers
    };

    return jsonRes(res, {
      data: stats
    });
  } catch (err) {
    console.error('Get user stats error:', err);
    return jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default handler;
