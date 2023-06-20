// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';

export type InitDateResponse = {
  beianText: string;
  googleVerKey: string;
  baiduTongji: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  jsonRes<InitDateResponse>(res, {
    data: {
      beianText: process.env.SAFE_BEIAN_TEXT || '',
      googleVerKey: process.env.CLIENT_GOOGLE_VER_TOKEN || '',
      baiduTongji: process.env.BAIDU_TONGJI === '1'
    }
  });
}
