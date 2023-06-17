// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, OpenApi } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const count = await OpenApi.find({ userId }).countDocuments();

    if (count >= 10) {
      throw new Error('最多 10 组 API 秘钥');
    }

    const apiKey = `fastgpt-${nanoid()}`;

    await OpenApi.create({
      userId,
      apiKey
    });

    jsonRes(res, {
      data: apiKey
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
