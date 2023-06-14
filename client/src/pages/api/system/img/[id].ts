import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Image } from '@/service/mongo';

// get the models available to the system
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { id } = req.query;

    const data = await Image.findById(id);

    if (!data) {
      throw new Error('no image');
    }
    res.setHeader('Content-Type', 'image/jpeg');

    res.send(data.binary);
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
