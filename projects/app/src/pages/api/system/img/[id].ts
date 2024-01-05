import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { readMongoImg } from '@fastgpt/service/common/file/image/controller';

// get the models available to the system
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { id } = req.query as { id: string };

    res.setHeader('Content-Type', 'image/jpeg');

    res.send(await readMongoImg({ id }));
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
