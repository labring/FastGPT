import { readFileSync } from 'fs';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (global.feConfigs) {
    return res.send(global.feConfigs);
  }
  const filename =
    process.env.NODE_ENV === 'development' ? 'data/config.local.json' : '/app/data/config.json';
  const content = JSON.parse(readFileSync(filename, 'utf-8'));

  global.feConfigs = content;

  res.send(global.feConfigs);
}
