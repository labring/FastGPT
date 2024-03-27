import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';

export type Response = {
  id: string;
  q: string;
  a: string;
  source: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { image, type } = req.query as {
      image: string;
      type: string;
    };

    jsonRes(res, {
      data: {
        description: '这是是一个流程图，情分析途中的场景'
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
