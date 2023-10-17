import type { SystemEnvType } from '@/types';
import type { FeConfigsType } from '@fastgpt/common/type/index.d';
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { readFileSync } from 'fs';
import type { InitDateResponse } from '@/global/common/api/systemRes';
import { formatPrice } from '@fastgpt/common/bill';
import { getTikTokenEnc } from '@/utils/common/tiktoken';
import { initHttpAgent } from '@fastgpt/core/init';
import {
  defaultChatModels,
  defaultQAModels,
  defaultCQModels,
  defaultExtractModels,
  defaultQGModels,
  defaultVectorModels
} from '@/constants/model';
import {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  VectorModelItemType
} from '@/types/model';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  getInitConfig();
  getModelPrice();

  jsonRes<InitDateResponse>(res, {
    data: {
      feConfigs: global.feConfigs,
      chatModels: global.chatModels,
      qaModels: global.qaModels,
      cqModels: global.cqModels,
      extractModels: global.extractModels,
      qgModels: global.qgModels,
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
    const res = JSON.parse(readFileSync(filename, 'utf-8')) as {
      FeConfig: FeConfigsType;
      SystemParams: SystemEnvType;
      ChatModels: ChatModelItemType[];
      QAModels: LLMModelItemType[];
      CQModels: FunctionModelItemType[];
      ExtractModels: FunctionModelItemType[];
      QGModels: LLMModelItemType[];
      VectorModels: VectorModelItemType[];
    };

    console.log(`System Version: ${global.systemVersion}`);

    console.log(res);

    global.systemEnv = res.SystemParams
      ? { ...defaultSystemEnv, ...res.SystemParams }
      : defaultSystemEnv;
    global.feConfigs = res.FeConfig ? { ...defaultFeConfigs, ...res.FeConfig } : defaultFeConfigs;

    global.chatModels = res.ChatModels || defaultChatModels;
    global.qaModels = res.QAModels || defaultQAModels;
    global.cqModels = res.CQModels || defaultCQModels;
    global.extractModels = res.ExtractModels || defaultExtractModels;
    global.qgModels = res.QGModels || defaultQGModels;

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
  global.qaModels = defaultQAModels;
  global.cqModels = defaultCQModels;
  global.extractModels = defaultExtractModels;
  global.qgModels = defaultQGModels;

  global.vectorModels = defaultVectorModels;
  global.priceMd = '';

  console.log('use default config');
  console.log({
    feConfigs: defaultFeConfigs,
    systemEnv: defaultSystemEnv,
    chatModels: defaultChatModels,
    qaModels: defaultQAModels,
    cqModels: defaultCQModels,
    extractModels: defaultExtractModels,
    qgModels: defaultQGModels,
    vectorModels: defaultVectorModels
  });
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
${global.qaModels
  ?.map((item) => `| 文件QA拆分-${item.name} | ${formatPrice(item.price, 1000)} |`)
  .join('\n')}
${global.cqModels
  ?.map((item) => `| 问题分类-${item.name} | ${formatPrice(item.price, 1000)} |`)
  .join('\n')}
${global.extractModels
  ?.map((item) => `| 内容提取-${item.name} | ${formatPrice(item.price, 1000)} |`)
  .join('\n')}
${global.qgModels
  ?.map((item) => `| 下一步指引-${item.name} | ${formatPrice(item.price, 1000)} |`)
  .join('\n')}
`;
  console.log(global.priceMd);
}
