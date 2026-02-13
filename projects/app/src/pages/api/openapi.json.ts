import type { NextApiRequest, NextApiResponse } from 'next';
import { openAPIDocument } from '@fastgpt/global/openapi';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json(openAPIDocument);
}
