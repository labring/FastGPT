import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { clearCookie } from '@fastgpt/service/support/permission/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    clearCookie(res);
    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
