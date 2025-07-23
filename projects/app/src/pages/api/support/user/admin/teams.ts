import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
// import { connectToDatabase } from '@/service/mongo';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    // 验证管理员权限
    await authAdmin(req);

    // 聚合查询团队、成员数量和所有者信息
    const teams = await MongoTeam.aggregate([
      {
        $lookup: {
          from: 'team_members',
          localField: '_id',
          foreignField: 'teamId',
          as: 'members'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerId',
          foreignField: '_id',
          as: 'owner'
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          ownerId: 1,
          memberCount: { $size: '$members' },
          ownerName: { $arrayElemAt: ['$owner.username', 0] },
          createTime: 1
        }
      },
      {
        $sort: { createTime: -1 }
      }
    ]);

    return jsonRes(res, {
      data: teams
    });
  } catch (err: any) {
    console.error('Get teams error:', err);
    return jsonRes(res, {
      code: 500,
      message: '获取团队列表失败',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

export default handler;
