// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import axios from 'axios';
import { axiosConfig } from '@/service/ai/openai';

export type Props = {
  input: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req });

    const result = await sensitiveCheck(req.body);

    jsonRes(res, {
      data: result,
      message: result
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export async function sensitiveCheck({ input }: Props) {
  const response = await axios({
    ...axiosConfig(),
    method: 'POST',
    url: `/moderations`,
    data: {
      input
    }
  });

  const data = (response.data.results?.[0]?.category_scores as Record<string, number>) || {};

  const values = Object.values(data);

  for (const val of values) {
    if (val > 0.2) {
      return Promise.reject('您的内容不合规');
    }
  }

  return '';
}
