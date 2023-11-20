import type { FeConfigsType, SystemEnvType } from '@fastgpt/global/common/system/types/index.d';
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { readFileSync } from 'fs';
import type { ConfigFileType, InitDateResponse } from '@/global/common/api/systemRes';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import { getTikTokenEnc } from '@fastgpt/global/common/string/tiktoken';
import { initHttpAgent } from '@fastgpt/service/common/middle/httpAgent';
import {
  defaultChatModels,
  defaultQAModels,
  defaultCQModels,
  defaultExtractModels,
  defaultQGModels,
  defaultVectorModels,
  defaultAudioSpeechModels,
  defaultWhisperModel
} from '@fastgpt/global/core/ai/model';

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
      vectorModels: global.vectorModels,
      audioSpeechModels: global.audioSpeechModels.map((item) => ({
        ...item,
        baseUrl: undefined,
        key: undefined
      })),
      priceMd: global.priceMd,
      systemVersion: global.systemVersion || '0.0.0'
    }
  });
}

const defaultSystemEnv: SystemEnvType = {
  vectorMaxProcess: 15,
  qaMaxProcess: 15,
  pgHNSWEfSearch: 100
};
const defaultFeConfigs: FeConfigsType = {
  show_emptyChat: true,
  show_contact: true,
  show_git: true,
  docUrl: 'https://docs.fastgpt.in',
  openAPIDocUrl: 'https://doc.fastgpt.in/docs/development/openapi',
  systemTitle: 'FastGPT',
  authorText: 'Made by FastGPT Team.',
  limit: {
    exportLimitMinutes: 0
  },
  scripts: [],
  favicon: '/favicon.ico'
};

export function initGlobal() {
  // init tikToken
  getTikTokenEnc();
  initHttpAgent();
  global.qaQueueLen = 0;
  global.vectorQueueLen = 0;
}

export function getInitConfig() {
  try {
    if (global.feConfigs) return;

    getSystemVersion();

    const filename =
      process.env.NODE_ENV === 'development' ? 'data/config.local.json' : '/app/data/config.json';
    const res = JSON.parse(readFileSync(filename, 'utf-8')) as ConfigFileType;

    console.log(`System Version: ${global.systemVersion}`);

    setDefaultData(res);
  } catch (error) {
    setDefaultData();
    console.log('get init config error, set default', error);
  }
}

export function setDefaultData(res?: ConfigFileType) {
  global.systemEnv = res?.SystemParams
    ? { ...defaultSystemEnv, ...res.SystemParams }
    : defaultSystemEnv;
  global.feConfigs = res?.FeConfig
    ? { ...defaultFeConfigs, ...res.FeConfig, isPlus: !!res.SystemParams?.pluginBaseUrl }
    : defaultFeConfigs;

  global.chatModels = res?.ChatModels || defaultChatModels;
  global.qaModels = res?.QAModels || defaultQAModels;
  global.cqModels = res?.CQModels || defaultCQModels;
  global.extractModels = res?.ExtractModels || defaultExtractModels;
  global.qgModels = res?.QGModels || defaultQGModels;

  global.vectorModels = res?.VectorModels || defaultVectorModels;

  global.audioSpeechModels = res?.AudioSpeechModels || defaultAudioSpeechModels;

  global.whisperModel = res?.WhisperModel || defaultWhisperModel;

  global.priceMd = '';

  console.log(global);
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
${global.audioSpeechModels
  ?.map((item) => `| 语音播放-${item.name} | ${formatPrice(item.price, 1000)} |`)
  .join('\n')}
${`| 语音输入-${global.whisperModel.name} | ${global.whisperModel.price}/分钟 |`}
`;
  console.log(global.priceMd);
}
