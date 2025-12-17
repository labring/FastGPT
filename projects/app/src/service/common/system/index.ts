import { initHttpAgent } from '@fastgpt/service/common/middle/httpAgent';
import fs, { existsSync } from 'fs';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types/index.d';
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { initFastGPTConfig } from '@fastgpt/service/common/system/tools';
import json5 from 'json5';
import { defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import { MongoTemplateTypes } from '@fastgpt/service/core/app/templates/templateTypeSchema';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import {
  type DeepRagSearchProps,
  type SearchDatasetDataResponse
} from '@fastgpt/service/core/dataset/search/controller';
import { type AuthOpenApiLimitProps } from '@fastgpt/service/support/openapi/auth';
import type {
  PushUsageItemsProps,
  ConcatUsageProps,
  CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import { getSystemToolTags } from '@fastgpt/service/core/app/tool/api';
import { isProVersion } from '@fastgpt/service/common/system/constants';

export const readConfigData = async (name: string) => {
  const splitName = name.split('.');
  const devName = `${splitName[0]}.local.${splitName[1]}`;

  const filename = (() => {
    if (!isProduction) {
      // check local file exists
      const hasLocalFile = existsSync(`data/${devName}`);
      if (hasLocalFile) {
        return `data/${devName}`;
      }
      return `data/${name}`;
    }
    // Fallback to default production path
    const envPath = process.env.CONFIG_JSON_PATH || '/app/data';
    return `${envPath}/${name}`;
  })();

  const content = await fs.promises.readFile(filename, 'utf-8');

  return content;
};

/* Init global variables */
export function initGlobalVariables() {
  function initPlusRequest() {
    global.textCensorHandler = function textCensorHandler({ text }: { text: string }) {
      if (!isProVersion()) return Promise.resolve({ code: 200 });
      return POST<{ code: number; message?: string }>('/common/censor/check', { text });
    };

    global.deepRagHandler = function deepRagHandler(data: DeepRagSearchProps) {
      return POST<SearchDatasetDataResponse>('/core/dataset/deepRag', data);
    };

    global.authOpenApiHandler = function authOpenApiHandler(data: AuthOpenApiLimitProps) {
      if (!isProVersion()) return Promise.resolve();
      return POST<AuthOpenApiLimitProps>('/support/openapi/authLimit', data);
    };

    global.createUsageHandler = function createUsageHandler(data: CreateUsageProps) {
      if (!isProVersion()) return;
      return POST<string>('/support/wallet/usage/createUsage', data);
    };
    global.concatUsageHandler = function concatUsageHandler(data: ConcatUsageProps) {
      if (!isProVersion()) return;
      return POST('/support/wallet/usage/concatUsage', data);
    };
    global.pushUsageItemsHandler = function pushUsageItemsHandler(data: PushUsageItemsProps) {
      if (!isProVersion()) return;
      return POST('/support/wallet/usage/pushUsageItems', data);
    };
  }

  global.datasetParseQueueLen = global.datasetParseQueueLen ?? 0;
  global.qaQueueLen = global.qaQueueLen ?? 0;
  global.vectorQueueLen = global.vectorQueueLen ?? 0;
  initHttpAgent();
  initPlusRequest();
}

/* Init system data(Need to connected db). It only needs to run once */
export async function getInitConfig() {
  const getSystemVersion = async () => {
    if (global.systemVersion) return;
    try {
      if (process.env.NODE_ENV === 'development') {
        global.systemVersion = process.env.npm_package_version || '0.0.0';
      } else {
        const packageJson = json5.parse(await fs.promises.readFile('/app/package.json', 'utf-8'));

        global.systemVersion = packageJson?.version;
      }
      console.log(`System Version: ${global.systemVersion}`);
    } catch (error) {
      console.log(error);

      global.systemVersion = '0.0.0';
    }
  };

  await Promise.all([initSystemConfig(), getSystemVersion()]);
}

const defaultFeConfigs: FastGPTFeConfigsType = {
  show_emptyChat: true,
  show_git: true,
  docUrl: 'https://doc.fastgpt.io',
  openAPIDocUrl: 'https://doc.fastgpt.io/docs/introduction/development/openapi',
  submitPluginRequestUrl: 'https://github.com/labring/fastgpt-plugin/issues',
  appTemplateCourse:
    'https://fael3z0zfze.feishu.cn/wiki/CX9wwMGyEi5TL6koiLYcg7U0nWb?fromScene=spaceOverview',
  systemTitle: 'FastGPT',
  concatMd:
    '项目开源地址: [FastGPT GitHub](https://github.com/labring/FastGPT)\n交流群: ![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu1.png)',
  limit: {
    exportDatasetLimitMinutes: 0,
    websiteSyncLimitMinuted: 0
  },
  scripts: [],
  favicon: '/favicon.ico',
  uploadFileMaxSize: 500,
  chineseRedirectUrl: process.env.CHINESE_IP_REDIRECT_URL || ''
};

export async function initSystemConfig() {
  // load config
  const [{ fastgptConfig, licenseData }, fileConfig] = await Promise.all([
    getFastGPTConfigFromDB(),
    readConfigData('config.json')
  ]);
  global.licenseData = licenseData;

  const fileRes = json5.parse(fileConfig) as FastGPTConfigFileType;

  // get config from database
  const config: FastGPTConfigFileType = {
    feConfigs: {
      ...fileRes?.feConfigs,
      ...defaultFeConfigs,
      ...(fastgptConfig.feConfigs || {}),
      isPlus: !!licenseData,
      hideChatCopyrightSetting: process.env.HIDE_CHAT_COPYRIGHT_SETTING === 'true',
      show_aiproxy: !!process.env.AIPROXY_API_ENDPOINT,
      show_coupon: process.env.SHOW_COUPON === 'true',
      show_discount_coupon: process.env.SHOW_DISCOUNT_COUPON === 'true',
      show_dataset_enhance: licenseData?.functions?.datasetEnhance,
      show_batch_eval: licenseData?.functions?.batchEval,
      payFormUrl: process.env.PAY_FORM_URL || ''
    },
    systemEnv: {
      ...fileRes.systemEnv,
      ...(fastgptConfig.systemEnv || {})
    },
    subPlans: fastgptConfig.subPlans
  };

  // set config
  initFastGPTConfig(config);

  console.log({
    feConfigs: global.feConfigs,
    systemEnv: global.systemEnv,
    subPlans: global.subPlans,
    licenseData: global.licenseData
  });
}

export async function initSystemPluginTags() {
  try {
    const tags = await getSystemToolTags();

    if (tags.length > 0) {
      const bulkOps = tags.map((tag, index) => ({
        updateOne: {
          filter: { tagId: tag.id },
          update: {
            $set: {
              tagId: tag.id,
              tagName: tag.name,
              tagOrder: index,
              isSystem: true
            }
          },
          upsert: true
        }
      }));

      await MongoPluginToolTag.bulkWrite(bulkOps);
    }
  } catch (error) {
    console.error('Error initializing system plugin tags:', error);
  }
}

export async function initAppTemplateTypes() {
  try {
    await Promise.all(
      defaultTemplateTypes.map((templateType) => {
        const { typeOrder, ...rest } = templateType;

        return MongoTemplateTypes.updateOne(
          {
            typeId: templateType.typeId
          },
          {
            $set: rest
          },
          {
            upsert: true
          }
        );
      })
    );
  } catch (error) {
    console.error('Error initializing system templates:', error);
  }
}
