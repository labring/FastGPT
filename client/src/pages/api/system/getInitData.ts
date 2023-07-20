import type { FeConfigsType, SystemEnvType } from '@/types';
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { readFileSync } from 'fs';
import {
  type QAModelItemType,
  type ChatModelItemType,
  type VectorModelItemType
} from '@/types/model';

export type InitDateResponse = {
  chatModels: ChatModelItemType[];
  qaModels: QAModelItemType[];
  vectorModels: VectorModelItemType[];
  systemEnv: SystemEnvType;
  feConfigs: FeConfigsType;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!global.feConfigs) {
    await getInitConfig();
  }
  jsonRes<InitDateResponse>(res, {
    data: {
      systemEnv: global.systemEnv,
      feConfigs: global.feConfigs,
      chatModels: global.chatModels,
      qaModels: global.qaModels,
      vectorModels: global.vectorModels
    }
  });
}

export async function getInitConfig() {
  try {
    const res = JSON.parse(readFileSync('data/config.json', 'utf-8'));
    console.log(res);

    global.systemEnv = res.SystemParams;
    global.feConfigs = res.FeConfig;
    global.chatModels = res.ChatModels;
    global.qaModels = res.QAModels;
    global.vectorModels = res.VectorModels;
  } catch (error) {
    return Promise.reject('get init config error');
  }
}
