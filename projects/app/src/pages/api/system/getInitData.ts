import type { FeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { readFileSync, readdirSync } from 'fs';
import type { ConfigFileType, InitDateResponse } from '@/global/common/api/systemRes';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import { getTikTokenEnc } from '@fastgpt/global/common/string/tiktoken';
import { initHttpAgent } from '@fastgpt/service/common/middle/httpAgent';
import { SimpleModeTemplate_FastGPT_Universal } from '@/global/core/app/constants';
import { getSimpleTemplatesFromPlus } from '@/service/core/app/utils';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { getFastGPTFeConfig } from '@fastgpt/service/common/system/config/controller';
import { connectToDatabase } from '@/service/mongo';
import { PluginTemplateType } from '@fastgpt/global/core/plugin/type';
import { readConfigData } from '@/service/common/system';
import { exit } from 'process';

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
      reRankModels: global.reRankModels.map((item) => ({
        ...item,
        requestUrl: undefined,
        requestAuth: undefined
      })),
      audioSpeechModels: global.audioSpeechModels,
      priceMd: global.priceMd,
      systemVersion: global.systemVersion || '0.0.0',
      simpleModeTemplates: global.simpleModeTemplates
    }
  });
}

const defaultFeConfigs: FeConfigsType = {
  show_emptyChat: true,
  show_git: true,
  docUrl: 'https://doc.fastgpt.in',
  openAPIDocUrl: 'https://doc.fastgpt.in/docs/development/openapi',
  systemTitle: 'FastGPT',
  concatMd:
    '* 项目开源地址: [FastGPT GitHub](https://github.com/labring/FastGPT)\n* 交流群: ![](https://doc.fastgpt.in/wechat-fastgpt.webp)',
  limit: {
    exportLimitMinutes: 0
  },
  scripts: [],
  favicon: '/favicon.ico'
};

export async function getInitConfig() {
  try {
    if (global.feConfigs) return;
    await connectToDatabase();
    initGlobal();

    // load config
    const [dbConfig, fileConfig] = await Promise.all([
      getFastGPTFeConfig(),
      readConfigData('config.json')
    ]);
    const fileRes = JSON.parse(fileConfig) as ConfigFileType;

    // get config from database
    const config: ConfigFileType = {
      ...fileRes,
      FeConfig: {
        ...defaultFeConfigs,
        ...fileRes.FeConfig,
        ...dbConfig
      }
    };

    // set config
    global.feConfigs = {
      isPlus: !!config.SystemParams.pluginBaseUrl,
      concatMd: config.FeConfig.show_git ? config.FeConfig.concatMd : '',
      ...config.FeConfig
    };
    global.systemEnv = config.SystemParams;

    global.chatModels = config.ChatModels;
    global.qaModels = config.QAModels;
    global.cqModels = config.CQModels;
    global.extractModels = config.ExtractModels;
    global.qgModels = config.QGModels;
    global.vectorModels = config.VectorModels;
    global.reRankModels = config.ReRankModels;
    global.audioSpeechModels = config.AudioSpeechModels;
    global.whisperModel = config.WhisperModel;

    global.priceMd = '';
  } catch (error) {
    console.error('Load init config error', error);
    exit(1);
  }
  await getSimpleModeTemplates();

  getSystemVersion();
  getModelPrice();
  getSystemPlugin();

  console.log({
    FeConfig: global.feConfigs,
    SystemParams: global.systemEnv,
    ChatModels: global.chatModels,
    QAModels: global.qaModels,
    CQModels: global.cqModels,
    ExtractModels: global.extractModels,
    QGModels: global.qgModels,
    VectorModels: global.vectorModels,
    ReRankModels: global.reRankModels,
    AudioSpeechModels: global.reRankModels,
    WhisperModel: global.whisperModel,
    price: global.priceMd,
    simpleModeTemplates: global.simpleModeTemplates,
    communityPlugins: global.communityPlugins
  });
}

export function initGlobal() {
  global.communityPlugins = [];
  global.simpleModeTemplates = [];
  global.qaQueueLen = global.qaQueueLen ?? 0;
  global.vectorQueueLen = global.vectorQueueLen ?? 0;
  // init tikToken
  getTikTokenEnc();
  initHttpAgent();
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
}

async function getSimpleModeTemplates() {
  if (global.simpleModeTemplates && global.simpleModeTemplates.length > 0) return;

  try {
    const basePath =
      process.env.NODE_ENV === 'development' ? 'data/simpleTemplates' : '/app/data/simpleTemplates';
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
}

function getSystemPlugin() {
  if (global.communityPlugins && global.communityPlugins.length > 0) return;

  const basePath =
    process.env.NODE_ENV === 'development' ? 'data/pluginTemplates' : '/app/data/pluginTemplates';
  // read data/pluginTemplates directory, get all json file
  const files = readdirSync(basePath);
  // filter json file
  const filterFiles = files.filter((item) => item.endsWith('.json'));

  // read json file
  const fileTemplates: PluginTemplateType[] = filterFiles.map((filename) => {
    const content = readFileSync(`${basePath}/${filename}`, 'utf-8');
    return {
      ...JSON.parse(content),
      id: `${PluginSourceEnum.community}-${filename.replace('.json', '')}`,
      source: PluginSourceEnum.community
    };
  });

  global.communityPlugins = fileTemplates;
}
