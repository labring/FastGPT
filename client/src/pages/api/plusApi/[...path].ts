import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { request } from '@/api/service/request';
import type { Method } from 'axios';
import { connectToDatabase } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const method = (req.method || 'POST') as Method;
    const { path = [], ...query } = req.query as any;

    const url = `/${path?.join('/')}`;

    if (!url) {
      throw new Error('url is empty');
    }

    const data = {
      ...req.body,
      ...query
    };

    const repose = await request(
      url,
      data,
      {
        // @ts-ignore
        headers: req.headers
      },
      method
    );

    jsonRes(res, {
      data: repose
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
