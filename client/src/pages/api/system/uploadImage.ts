import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Image } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

type Props = { base64Img: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });
    const { base64Img } = req.body as Props;

    const data = await uploadImg({
      userId,
      base64Img
    });

    jsonRes(res, { data });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export async function uploadImg({ base64Img, userId }: Props & { userId: string }) {
  const base64Data = base64Img.split(',')[1];

  const { _id } = await Image.create({
    userId,
    binary: Buffer.from(base64Data, 'base64')
  });

  return `/api/system/img/${_id}`;
}
