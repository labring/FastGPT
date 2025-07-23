import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'GET') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    // 验证管理员权限
    await authAdmin(req);

    if (!userId) {
      return jsonRes(res, {
        code: 400,
        message: 'User ID is required'
      });
    }

    // 获取用户基本信息
    const user = await MongoUser.findById(userId).select('-password');
    if (!user) {
      return jsonRes(res, {
        code: 404,
        message: 'User not found'
      });
    }

    // 获取用户的团队信息
    const teams = await MongoTeamMember.find({ userId }).populate('teamId', 'name avatar').lean();

    // 获取用户创建的应用
    const apps = await MongoApp.find({ tmbId: userId })
      .select('name type avatar createTime')
      .sort({ createTime: -1 })
      .limit(20)
      .lean();

    // 获取用户创建的知识库
    const datasets = await MongoDataset.find({ tmbId: userId })
      .select('name vectorModel createTime')
      .sort({ createTime: -1 })
      .limit(20)
      .lean();

    // 模拟登录历史（实际项目中应该有专门的登录日志表）
    const loginHistory: any[] = [];

    return jsonRes(res, {
      data: {
        user,
        teams,
        apps,
        datasets,
        loginHistory
      }
    });
  } catch (err) {
    console.error('Get user detail error:', err);
    return jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default handler;
