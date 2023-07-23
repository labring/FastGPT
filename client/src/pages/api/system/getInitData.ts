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
    setDefaultData();
    return Promise.reject('get init config error');
  }
}

export function setDefaultData() {
  global.systemEnv = {
    vectorMaxProcess: 15,
    qaMaxProcess: 15,
    pgIvfflatProbe: 20,
    sensitiveCheck: false
  };
  global.feConfigs = {
    show_emptyChat: true,
    show_register: true,
    show_appStore: true,
    show_userDetail: true,
    show_git: true,
    systemTitle: 'FastAI',
    authorText: 'Made by FastAI Team.'
  };
  global.chatModels = [
    {
      model: 'gpt-3.5-turbo',
      name: 'FastAI-4k',
      contextMaxToken: 4000,
      quoteMaxToken: 2400,
      maxTemperature: 1.2,
      price: 1.5
    },
    {
      model: 'gpt-3.5-turbo-16k',
      name: 'FastAI-16k',
      contextMaxToken: 16000,
      quoteMaxToken: 8000,
      maxTemperature: 1.2,
      price: 3
    },
    {
      model: 'gpt-4',
      name: 'FastAI-Plus',
      contextMaxToken: 8000,
      quoteMaxToken: 4000,
      maxTemperature: 1.2,
      price: 45
    }
  ];
  global.qaModels = [
    {
      model: 'gpt-3.5-turbo-16k',
      name: 'FastAI-16k',
      maxToken: 16000,
      price: 3
    }
  ];
  global.vectorModels = [
    {
      model: 'text-embedding-ada-002',
      name: 'Embedding-2',
      price: 0.2
    }
  ];
}
