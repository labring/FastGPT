import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'PUT') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    const { userId, newPassword } = req.body;

    // 验证管理员权限
    await authAdmin(req);

    // 验证参数
    if (!userId || !newPassword) {
      return jsonRes(res, {
        code: 400,
        message: 'User ID and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return jsonRes(res, {
        code: 400,
        message: 'Password must be at least 6 characters long'
      });
    }

    // 检查用户是否存在
    const user = await MongoUser.findById(userId);
    if (!user) {
      return jsonRes(res, {
        code: 404,
        message: 'User not found'
      });
    }

    // 更新密码
    await MongoUser.findByIdAndUpdate(userId, {
      password: hashStr(newPassword),
      passwordUpdateTime: new Date()
    });

    return jsonRes(res, {
      data: { success: true }
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default handler;
