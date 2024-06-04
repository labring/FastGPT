import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import type { GetApiKeyProps } from '@/global/support/openapi/api';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId } = req.query as GetApiKeyProps;

    if (appId) {
      await authApp({
        req,
        authToken: true,
        appId,
        per: ManagePermissionVal
      });

      const findResponse = await MongoOpenApi.find({
        appId
      }).sort({ _id: -1 });

      return jsonRes(res, {
        data: findResponse.map((item) => item.toObject())
      });
    }

    const { teamId, tmbId, permission } = await authUserPer({
      req,
      authToken: true,
      per: ManagePermissionVal
    });

    const findResponse = await MongoOpenApi.find({
      appId,
      teamId,
      ...(!permission.isOwner && { tmbId })
    }).sort({ _id: -1 });

    return jsonRes(res, {
      data: findResponse.map((item) => item.toObject())
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
