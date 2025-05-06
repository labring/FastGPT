import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await authCert({ req, authToken: true });
    const { userid } = req.query;

    if (!userid) {
      throw new Error('Params is missing');
    }

    const user = await MongoUser.findOne({
      _id: userid
    });

    if (!user) {
      throw new Error('can not find it');
    }

    return jsonRes(res, {
      data: user.passwordUpdateTime
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
