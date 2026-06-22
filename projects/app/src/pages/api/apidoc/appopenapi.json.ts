import type { NextApiRequest, NextApiResponse } from 'next';
import { appOpenAPIDocument } from '@fastgpt/global/openapi/provider/appopenapi';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json(appOpenAPIDocument);
}
