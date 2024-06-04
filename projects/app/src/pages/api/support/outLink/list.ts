import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

/* get shareChat list by appId */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { appId, type } = req.query as {
      appId: string;
      type: string;
    };

    const { teamId, tmbId, isOwner } = await authApp({
      req,
      authToken: true,
      appId,
      per: WritePermissionVal
    });

    const data = await MongoOutLink.find({
      appId,
      ...(isOwner ? { teamId } : { tmbId }),
      type: type
    }).sort({
      _id: -1
    });

    jsonRes(res, { data });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
