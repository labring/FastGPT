import type { SystemEnvType } from '@/types';
import type { FeConfigsType } from '@fastgpt/common/type/index.d';
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { readFileSync } from 'fs';
import type { InitDateResponse } from '@/global/common/api/systemRes';
import type { VectorModelItemType, FunctionModelItemType } from '@/types/model';
import { formatPrice } from '@fastgpt/common/bill';
import { getTikTokenEnc } from '@/utils/common/tiktoken';
import { initHttpAgent } from '@fastgpt/core/init';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  getInitConfig();
  getModelPrice();

  jsonRes<InitDateResponse>(res, {
    data: {
      feConfigs: global.feConfigs,
      chatModels: global.chatModels,
      qaModel: global.qaModel,
      vectorModels: global.vectorModels,
      priceMd: global.priceMd,
      systemVersion: global.systemVersion || '0.0.0'
    }
  });
}

const defaultSystemEnv: SystemEnvType = {
  vectorMaxProcess: 15,
  qaMaxProcess: 15,
  pgHNSWEfSearch: 40
};
const defaultFeConfigs: FeConfigsType = {
  show_emptyChat: true,
  show_contact: true,
  show_git: true,
  show_doc: true,
  systemTitle: 'FastGPT',
  authorText: 'Made by FastGPT Team.',
  limit: {
    exportLimitMinutes: 0
  },
  scripts: []
};
const defaultChatModels = [
  {
    model: 'gpt-3.5-turbo',
    name: 'GPT35-4k',
    contextMaxToken: 4000,
    quoteMaxToken: 2400,
    maxTemperature: 1.2,
    price: 0
  },
  {
    model: 'gpt-3.5-turbo-16k',
    name: 'GPT35-16k',
    contextMaxToken: 16000,
    quoteMaxToken: 8000,
    maxTemperature: 1.2,
    price: 0
  },
  {
    model: 'gpt-4',
    name: 'GPT4-8k',
    contextMaxToken: 8000,
    quoteMaxToken: 4000,
    maxTemperature: 1.2,
    price: 0
  }
];
const defaultQAModel = {
  model: 'gpt-3.5-turbo-16k',
  name: 'GPT35-16k',
  maxToken: 16000,
  price: 0
};
export const defaultExtractModel: FunctionModelItemType = {
  model: 'gpt-3.5-turbo-16k',
  name: 'GPT35-16k',
  maxToken: 16000,
  price: 0,
  prompt: '',
  functionCall: true
};
export const defaultCQModel: FunctionModelItemType = {
  model: 'gpt-3.5-turbo-16k',
  name: 'GPT35-16k',
  maxToken: 16000,
  price: 0,
  prompt: '',
  functionCall: true
};
export const defaultQGModel: FunctionModelItemType = {
  model: 'gpt-3.5-turbo',
  name: 'FastAI-4k',
  maxToken: 4000,
  price: 1.5,
  prompt: '',
  functionCall: false
};

const defaultVectorModels: VectorModelItemType[] = [
  {
    model: 'text-embedding-ada-002',
    name: 'Embedding-2',
    price: 0,
    defaultToken: 500,
    maxToken: 3000
  }
];

export function initGlobal() {
  // init tikToken
  getTikTokenEnc();
  initHttpAgent();
  global.qaQueueLen = 0;
  global.vectorQueueLen = 0;
  global.sendInformQueue = [];
  global.sendInformQueueLen = 0;
}

export function getInitConfig() {
  try {
    if (global.feConfigs) return;

    getSystemVersion();

    const filename =
      process.env.NODE_ENV === 'development' ? 'data/config.local.json' : '/app/data/config.json';
    const res = JSON.parse(readFileSync(filename, 'utf-8'));

    console.log(`System Version: ${global.systemVersion}`);

    console.log(res);

    global.systemEnv = res.SystemParams
      ? { ...defaultSystemEnv, ...res.SystemParams }
      : defaultSystemEnv;
    global.feConfigs = res.FeConfig ? { ...defaultFeConfigs, ...res.FeConfig } : defaultFeConfigs;
    global.chatModels = res.ChatModels || defaultChatModels;
    global.qaModel = res.QAModel || defaultQAModel;
    global.extractModel = res.ExtractModel || defaultExtractModel;
    global.cqModel = res.CQModel || defaultCQModel;
    global.qgModel = res.QGModel || defaultQGModel;
    global.vectorModels = res.VectorModels || defaultVectorModels;
  } catch (error) {
    setDefaultData();
    console.log('get init config error, set default', error);
  }
}

export function setDefaultData() {
  global.systemEnv = defaultSystemEnv;
  global.feConfigs = defaultFeConfigs;
  global.chatModels = defaultChatModels;
  global.qaModel = defaultQAModel;
  global.vectorModels = defaultVectorModels;
  global.extractModel = defaultExtractModel;
  global.cqModel = defaultCQModel;
  global.qgModel = defaultQGModel;
  global.priceMd = '';
}

export function getSystemVersion() {
  try {
    if (process.env.NODE_ENV === 'development') {
      global.systemVersion = process.env.npm_package_version || '0.0.0';
      return;
    }
    const packageJson = JSON.parse(readFileSync('/app/package.json', 'utf-8'));

    global.systemVersion = packageJson?.version;
  } catch (error) {
    console.log(error);

    global.systemVersion = '0.0.0';
  }
}

function getModelPrice() {
  if (global.priceMd) return;
  global.priceMd = `| 计费项 | 价格: 元/ 1K tokens(包含上下文)|
| --- | --- |
${global.vectorModels
  ?.map((item) => `| 索引-${item.name} | ${formatPrice(item.price, 1000)} |`)
  .join('\n')}
${global.chatModels
  ?.map((item) => `| 对话-${item.name} | ${formatPrice(item.price, 1000)} |`)
  .join('\n')}
| 文件QA拆分 | ${formatPrice(global.qaModel?.price, 1000)} |
| 高级编排 - 问题分类 | ${formatPrice(global.cqModel?.price, 1000)} |
| 高级编排 - 内容提取 | ${formatPrice(global.extractModel?.price, 1000)} |
| 下一步指引 | ${formatPrice(global.qgModel?.price, 1000)} |
`;
  console.log(global.priceMd);
}
