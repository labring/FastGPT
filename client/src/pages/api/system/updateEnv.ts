import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { readFileSync } from 'fs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authUser({ req, authRoot: true });
  updateSystemEnv();
  jsonRes(res);
}

export async function updateSystemEnv() {
  try {
    const res = JSON.parse(readFileSync('data/SystemParams.json', 'utf-8'));

    global.systemEnv = {
      ...global.systemEnv,
      ...res
    };
  } catch (error) {
    console.log('update system env error');
  }
}
