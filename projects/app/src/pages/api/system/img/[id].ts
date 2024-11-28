import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { readMongoImg } from '@fastgpt/service/common/file/image/controller';

// get the models available to the system
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { id } = req.query as { id: string };

    const { binary, mime } = await readMongoImg({ id });

    res.setHeader('Content-Type', mime);
    res.send(binary);
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
