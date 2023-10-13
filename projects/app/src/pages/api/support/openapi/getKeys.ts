import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOpenApi } from '@fastgpt/support/openapi/schema';
import { authUser } from '@fastgpt/support/user/auth';
import type { GetApiKeyProps } from '@/global/support/api/openapiReq.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId } = req.query as GetApiKeyProps;
    const { userId } = await authUser({ req, authToken: true });

    const findResponse = await MongoOpenApi.find({ userId, appId }).sort({ _id: -1 });

    jsonRes(res, {
      data: findResponse.map((item) => item.toObject())
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
