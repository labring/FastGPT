import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import * as SwaggerParser from '@apidevtools/swagger-parser';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const apiURL = req.body.url as string;

    const api = await (SwaggerParser as any).validate(apiURL);

    return jsonRes(res, {
      data: api
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
