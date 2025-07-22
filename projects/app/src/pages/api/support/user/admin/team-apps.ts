import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

export type TeamAppsQuery = {
  teamId: string;
};

export type TeamAppInfo = {
  _id: string;
  name: string;
  type: string;
  avatar: string;
  updateTime: Date;
  tmbId: string;
  teamId: string;
};

export type TeamAppsResponse = {
  teamInfo: {
    _id: string;
    name: string;
    ownerId: string;
    memberCount: number;
  };
  apps: TeamAppInfo[];
  total: number;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    // 验证管理员权限
    await authAdmin(req);

    const { teamId } = req.query as TeamAppsQuery;

    if (!teamId) {
      return jsonRes(res, {
        code: 400,
        message: 'Team ID is required'
      });
    }

    // 获取团队信息
    const team = await MongoTeam.findById(teamId).lean();
    if (!team) {
      return jsonRes(res, {
        code: 404,
        message: 'Team not found'
      });
    }

    // 获取团队的应用列表
    const apps = await MongoApp.find({ teamId })
      .select('_id name type avatar createTime tmbId teamId')
      .sort({ createTime: -1 })
      .lean();

    // 获取团队成员数量
    const { MongoTeamMember } = await import('@fastgpt/service/support/user/team/teamMemberSchema');
    const memberCount = await MongoTeamMember.countDocuments({ teamId });

    const response: TeamAppsResponse = {
      teamInfo: {
        _id: team._id,
        name: team.name,
        ownerId: team.ownerId,
        memberCount
      },
      apps: apps.map((app) => ({
        _id: app._id,
        name: app.name,
        type: app.type,
        avatar: app.avatar,
        updateTime: app.updateTime,
        tmbId: app.tmbId,
        teamId: app.teamId
      })),
      total: apps.length
    };

    return jsonRes(res, {
      data: response
    });
  } catch (err: any) {
    console.error('Get team apps error:', err);
    return jsonRes(res, {
      code: 500,
      message: err.message || 'Internal server error'
    });
  }
}

export default handler;
