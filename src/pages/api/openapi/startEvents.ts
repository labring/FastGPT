// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { generateQA } from '@/service/events/generateQA';
import { generateVector } from '@/service/events/generateVector';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    generateQA();
    generateVector();

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
