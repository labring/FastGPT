import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { System } from '@/service/models/system';
import { authUser } from '@/service/utils/auth';

export type InitDateResponse = {
  beianText: string;
  googleVerKey: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authUser({ req, authRoot: true });
  updateSystemEnv();
  jsonRes<InitDateResponse>(res);
}

export async function updateSystemEnv() {
  try {
    const mongoData = await System.findOne();

    if (mongoData) {
      const obj = mongoData.toObject();
      global.systemEnv = {
        ...global.systemEnv,
        ...obj
      };
    }
    console.log('update env', global.systemEnv);
  } catch (error) {
    console.log('update system env error');
  }
}
