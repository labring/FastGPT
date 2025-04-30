import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await authCert({ req, authToken: true });
    console.log('req.query', req.query);
    const { userid } = req.query;

    if (!userid) {
      throw new Error('用户名不能为空');
    }

    // 根据用户名查询用户
    const user = await MongoUser.findOne({
      _id: userid
    });

    if (!user) {
      throw new Error('用户不存在');
    }
    console.log('user', user);

    return jsonRes(res, {
      data: {
        updateTime: user.passwordUpdateTime
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
