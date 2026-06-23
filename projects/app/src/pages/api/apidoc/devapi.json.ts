import type { NextApiRequest, NextApiResponse } from 'next';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json(openAPIDocument);
}
