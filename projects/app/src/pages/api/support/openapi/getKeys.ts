import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, OpenApi } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import type { GetApiKeyProps } from '@/api/support/openapi/index.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { appId } = req.query as GetApiKeyProps;
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const findResponse = await OpenApi.find({ userId, appId }).sort({ _id: -1 });

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
