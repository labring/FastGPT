import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { request } from '@fastgpt/service/common/api/plusRequest';
import type { Method } from 'axios';
import { connectToDatabase } from '@/service/mongo';
import { setCookie } from '@fastgpt/service/support/permission/controller';

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
        headers: {
          ...req.headers,
          // @ts-ignore
          rootkey: undefined
        }
      },
      method
    );

    /* special response */
    // response cookie
    if (repose?.cookie) {
      setCookie(res, repose.cookie);

      return jsonRes(res, {
        data: repose?.cookie
      });
    }

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
