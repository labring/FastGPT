import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import axios from 'axios';
import { httpsAgent } from '@/service/utils/tools';

/**
 * 读取网站的内容
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { url } = req.body as { url: string };
    if (!url) {
      throw new Error('缺少 url');
    }
    await connectToDatabase();

    const { authorization } = req.headers;

    await authToken(authorization);

    const data = await axios
      .get(url, {
        httpsAgent: httpsAgent(false)
      })
      .then((res) => res.data as string);

    jsonRes(res, { data });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
