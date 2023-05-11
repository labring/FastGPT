// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  jsonRes(res, {
    data: {
      beianText: process.env.SAFE_BEIAN_TEXT || ''
    }
  });
}
