import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Image } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

// get the models available to the system
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });
    const { base64Img } = req.body;
    const base64Data = base64Img.split(',')[1];

    const { _id } = await Image.create({
      userId,
      binary: Buffer.from(base64Data, 'base64')
    });

    jsonRes(res, { data: `/api/system/img/${_id}` });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
