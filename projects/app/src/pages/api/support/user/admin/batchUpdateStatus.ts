import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authAdmin } from '@/service/support/permission/admin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  if (req.method !== 'PUT') {
    return jsonRes(res, { code: 405, message: 'Method not allowed' });
  }

  try {
    const { userIds, status } = req.body;

    // 验证管理员权限
    await authAdmin(req);

    // 验证参数
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return jsonRes(res, {
        code: 400,
        message: 'User IDs array is required'
      });
    }

    if (!status || !Object.values(UserStatusEnum).includes(status as UserStatusEnum)) {
      return jsonRes(res, {
        code: 400,
        message: 'Valid status is required'
      });
    }

    // 批量更新用户状态
    const result = await MongoUser.updateMany({ _id: { $in: userIds } }, { status });

    return jsonRes(res, {
      data: {
        success: result.modifiedCount,
        failed: userIds.length - result.modifiedCount
      }
    });
  } catch (err) {
    console.error('Batch update status error:', err);
    return jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default handler;
