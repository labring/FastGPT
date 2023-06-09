// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser, getSystemOpenAiKey } from '@/service/utils/auth';
import type { TextPluginRequestParams } from '@/types/plugin';
import axios from 'axios';
import { axiosConfig } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (process.env.SENSITIVE_CHECK !== '1') {
      return jsonRes(res);
    }

    await authUser({ req });

    const { input } = req.body as TextPluginRequestParams;

    const response = await axios({
      ...axiosConfig(getSystemOpenAiKey('chat')),
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
        return jsonRes(res, {
          code: 500,
          message: '您的内容不合规'
        });
      }
    }

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
