import type { FeConfigsType } from '@/types';
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
  feConfigs: FeConfigsType;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!global.feConfigs) {
    await getInitConfig();
  }
  jsonRes<InitDateResponse>(res, {
    data: {
      feConfigs: global.feConfigs,
      chatModels: global.chatModels,
      qaModels: global.qaModels,
      vectorModels: global.vectorModels
    }
  });
}

const defaultSystemEnv = {
  vectorMaxProcess: 15,
  qaMaxProcess: 15,
  pgIvfflatProbe: 20
};
const defaultFeConfigs = {
  show_emptyChat: true,
  show_register: false,
  show_appStore: false,
  show_userDetail: false,
  show_git: true,
  systemTitle: 'FastAI',
  authorText: 'Made by FastAI Team.'
};
const defaultChatModels = [
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
const defaultQAModels = [
  {
    model: 'gpt-3.5-turbo-16k',
    name: 'FastAI-16k',
    maxToken: 16000,
    price: 3
  }
];
const defaultVectorModels = [
  {
    model: 'text-embedding-ada-002',
    name: 'Embedding-2',
    price: 0.2
  }
];

export async function getInitConfig() {
  try {
    const filename =
      process.env.NODE_ENV === 'development' ? 'data/config.local.json' : '/app/data/config.json';
    const res = JSON.parse(readFileSync(filename, 'utf-8'));
    console.log(res);

    global.systemEnv = res.SystemParams || defaultSystemEnv;
    global.feConfigs = res.FeConfig || defaultFeConfigs;
    global.chatModels = res.ChatModels || defaultChatModels;
    global.qaModels = res.QAModels || defaultQAModels;
    global.vectorModels = res.VectorModels || defaultVectorModels;
    global.systemPlugins = res.plugins || {};
  } catch (error) {
    setDefaultData();
    console.log('get init config error, set default', error);
  }
}

export function setDefaultData() {
  global.systemEnv = defaultSystemEnv;
  global.feConfigs = defaultFeConfigs;
  global.chatModels = defaultChatModels;
  global.qaModels = defaultQAModels;
  global.vectorModels = defaultVectorModels;
  global.systemPlugins = {};
}
