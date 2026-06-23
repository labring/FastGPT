import type { NextApiRequest, NextApiResponse } from 'next';
import { apiDocOpenAPIDocument } from '@fastgpt/global/openapi/provider/systemopenapi';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json(apiDocOpenAPIDocument);
}
