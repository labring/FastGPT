import type { FeConfigsType, SystemEnvType } from '@fastgpt/global/common/system/types/index.d';
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { readFileSync, readdirSync } from 'fs';
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
import { SimpleModeTemplate_FastGPT_Universal } from '@/global/core/app/constants';
import { getSimpleTemplatesFromPlus } from '@/service/core/app/utils';
import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await getInitConfig();

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
      systemVersion: global.systemVersion || '0.0.0',
      simpleModeTemplates: global.simpleModeTemplates
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

export async function getInitConfig() {
  try {
    if (global.feConfigs) return;
    initGlobal();

    const filename =
      process.env.NODE_ENV === 'development' ? 'data/config.local.json' : '/app/data/config.json';
    const res = JSON.parse(readFileSync(filename, 'utf-8')) as ConfigFileType;

    setDefaultData(res);
  } catch (error) {
    setDefaultData();
    console.log('get init config error, set default', error);
  }
  await getSimpleModeTemplates();

  getSystemVersion();
  getModelPrice();
  getSystemPlugin();
}

export function initGlobal() {
  // init tikToken
  getTikTokenEnc();
  initHttpAgent();
  global.communityPlugins = [];
  global.simpleModeTemplates = [];
  global.qaQueueLen = global.qaQueueLen ?? 0;
  global.vectorQueueLen = global.vectorQueueLen ?? 0;
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

  console.log(res);
}

export function getSystemVersion() {
  try {
    if (process.env.NODE_ENV === 'development') {
      global.systemVersion = process.env.npm_package_version || '0.0.0';
    } else {
      const packageJson = JSON.parse(readFileSync('/app/package.json', 'utf-8'));

      global.systemVersion = packageJson?.version;
    }
    console.log(`System Version: ${global.systemVersion}`);
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

async function getSimpleModeTemplates() {
  if (global.simpleModeTemplates && global.simpleModeTemplates.length > 0) return;

  try {
    const basePath =
      process.env.NODE_ENV === 'development'
        ? 'public/simpleTemplates'
        : '/app/projects/app/public/simpleTemplates';
    // read data/simpleTemplates directory, get all json file
    const files = readdirSync(basePath);
    // filter json file
    const filterFiles = files.filter((item) => item.endsWith('.json'));

    // read json file
    const fileTemplates = filterFiles.map((item) => {
      const content = readFileSync(`${basePath}/${item}`, 'utf-8');
      return {
        id: item.replace('.json', ''),
        ...JSON.parse(content)
      };
    });

    // fetch templates from plus
    const plusTemplates = await getSimpleTemplatesFromPlus();

    global.simpleModeTemplates = [
      SimpleModeTemplate_FastGPT_Universal,
      ...plusTemplates,
      ...fileTemplates
    ];
  } catch (error) {
    global.simpleModeTemplates = [SimpleModeTemplate_FastGPT_Universal];
  }
  console.log('simple mode templates: ');
  console.log(global.simpleModeTemplates);
}

function getSystemPlugin() {
  if (global.communityPlugins && global.communityPlugins.length > 0) return;

  const basePath =
    process.env.NODE_ENV === 'development'
      ? 'public/pluginTemplates'
      : '/app/projects/app/public/pluginTemplates';
  // read data/pluginTemplates directory, get all json file
  const files = readdirSync(basePath);
  // filter json file
  const filterFiles = files.filter((item) => item.endsWith('.json'));

  // read json file
  const fileTemplates = filterFiles.map((item) => {
    const content = readFileSync(`${basePath}/${item}`, 'utf-8');
    return {
      id: `${PluginTypeEnum.community}-${item.replace('.json', '')}`,
      type: PluginTypeEnum.community,
      ...JSON.parse(content)
    };
  });

  global.communityPlugins = fileTemplates;
  console.log('community plugins: ');
  console.log(fileTemplates);
}
