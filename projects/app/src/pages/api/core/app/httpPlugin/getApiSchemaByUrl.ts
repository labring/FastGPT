import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { loadOpenAPISchemaFromUrl } from '@fastgpt/global/common/string/swagger';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const apiURL = req.body.url as string;

    return jsonRes(res, {
      data: await loadOpenAPISchemaFromUrl(apiURL)
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
