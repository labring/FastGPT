import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { readFileSync } from 'fs';
import {
  type QAModelItemType,
  type ChatModelItemType,
  type VectorModelItemType
} from '@/types/model';

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
    console.log(global.systemEnv);
  } catch (error) {
    console.log('update system env error');
  }
}

const defaultmodels = {
  'FastAI-4k': {
    model: 'gpt-3.5-turbo',
    name: 'FastAI-4k',
    contextMaxToken: 4000,
    systemMaxToken: 2400,
    maxTemperature: 1.2,
    price: 1.5
  },
  'FastAI-16k': {
    model: 'gpt-3.5-turbo',
    name: 'FastAI-16k',
    contextMaxToken: 16000,
    systemMaxToken: 8000,
    maxTemperature: 1.2,
    price: 3
  },
  'FastAI-Plus': {
    model: 'gpt-4',
    name: 'FastAI-Plus',
    contextMaxToken: 8000,
    systemMaxToken: 4000,
    maxTemperature: 1.2,
    price: 45
  }
};
const defaultQaModels = {
  'FastAI-16k': {
    model: 'gpt-3.5-turbo',
    name: 'FastAI-16k',
    maxToken: 16000,
    price: 3
  }
};
const defaultVectorModels = {
  'text-embedding-ada-002': {
    model: 'text-embedding-ada-002',
    name: 'Embedding-2',
    price: 0.2
  }
};
export function initSystemModels() {
  const { chatModels, qaModels, vectorModels } = (() => {
    try {
      const chatModels = Object.values(JSON.parse(readFileSync('data/ChatModels.json', 'utf-8')));
      const qaModels = Object.values(JSON.parse(readFileSync('data/QAModels.json', 'utf-8')));
      const vectorModels = Object.values(
        JSON.parse(readFileSync('data/VectorModels.json', 'utf-8'))
      );

      return {
        chatModels,
        qaModels,
        vectorModels
      };
    } catch (error) {
      console.log(error);

      return {
        chatModels: Object.values(defaultmodels),
        qaModels: Object.values(defaultQaModels),
        vectorModels: Object.values(defaultVectorModels)
      };
    }
  })() as {
    chatModels: ChatModelItemType[];
    qaModels: QAModelItemType[];
    vectorModels: VectorModelItemType[];
  };
  global.chatModels = chatModels;
  global.qaModels = qaModels;
  global.vectorModels = vectorModels;
  console.log({
    chatModels,
    qaModels,
    vectorModels
  });

  return {
    chatModels,
    qaModels,
    vectorModels
  };
}

export function initFeConfig() {
  const feConfig = JSON.parse(readFileSync('data/FeConfig.json', 'utf-8'));

  global.feConfigs = feConfig;
  console.log(feConfig);

  return feConfig;
}
