// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import {
  type QAModelItemType,
  type ChatModelItemType,
  type VectorModelItemType
} from '@/types/model';
import { readFileSync } from 'fs';

export type InitDateResponse = {
  beianText: string;
  googleVerKey: string;
  baiduTongji: string;
  chatModels: ChatModelItemType[];
  qaModels: QAModelItemType[];
  vectorModels: VectorModelItemType[];
};

const defaultmodels = {
  'Gpt35-4k': {
    model: 'gpt-3.5-turbo',
    name: 'Gpt35-4k',
    contextMaxToken: 4000,
    systemMaxToken: 2400,
    maxTemperature: 1.2,
    price: 1.5
  },
  'Gpt35-16k': {
    model: 'gpt-3.5-turbo',
    name: 'Gpt35-16k',
    contextMaxToken: 16000,
    systemMaxToken: 8000,
    maxTemperature: 1.2,
    price: 3
  },
  Gpt4: {
    model: 'gpt-4',
    name: 'Gpt4',
    contextMaxToken: 8000,
    systemMaxToken: 4000,
    maxTemperature: 1.2,
    price: 45
  }
};
const defaultQaModels = {
  'Gpt35-16k': {
    model: 'gpt-3.5-turbo',
    name: 'Gpt35-16k',
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const envs = {
    beianText: process.env.SAFE_BEIAN_TEXT || '',
    googleVerKey: process.env.CLIENT_GOOGLE_VER_TOKEN || '',
    baiduTongji: process.env.BAIDU_TONGJI || ''
  };

  jsonRes<InitDateResponse>(res, {
    data: {
      ...envs,
      ...initSystemModels()
    }
  });
}

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

  return {
    chatModels,
    qaModels,
    vectorModels
  };
}
