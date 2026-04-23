import { initHttpAgent } from '@fastgpt/service/common/middle/httpAgent';
import fs from 'fs';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types/index';
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { initFastGPTConfig } from '@fastgpt/service/common/system/tools';
import json5 from 'json5';
import { defaultTemplateTypes } from '@fastgpt/global/core/app/constants';
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
import {
  setPromptLoader,
  DefaultPromptLoader,
  ProPromptLoader
} from '@fastgpt/service/core/ai/config/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { env } from '@fastgpt/service/env';
import { readConfigData } from '@fastgpt/service/common/system/config/controller';

const logger = getLogger(LogCategories.SYSTEM);

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
  global.small2bigQueueLen = global.small2bigQueueLen ?? 0;
  global.synthesisQueueLen = global.synthesisQueueLen ?? 0;
  initHttpAgent();
  initPlusRequest();
}

/* Init remote prompt loader */
export async function initProPromptLoader() {
  const { setPromptLoader } = await import('@fastgpt/service/core/ai/config/utils');

  const loader = new ProPromptLoader();

  // Set timeout for preloading (10 seconds)
  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error('Preload timeout')), 10000);
  });

  try {
    await Promise.race([loader.preloadAllTemplates(), timeoutPromise]);
    global.promptLoader = loader;
  } catch (preloadError) {
    console.error('[initProPromptLoader] Failed to preload templates:', preloadError);
    // Fallback to default loader
    const DefaultPromptLoader = await import('@fastgpt/service/core/ai/config/utils').then(
      (m) => m.DefaultPromptLoader
    );
    setPromptLoader(new DefaultPromptLoader());
  }
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
      logger.info('System version resolved', { systemVersion: global.systemVersion });
    } catch (error) {
      logger.error('System version resolve failed', { error });

      global.systemVersion = '0.0.0';
    }
  };

  await Promise.all([initSystemConfig(), getSystemVersion()]);
}

const defaultFeConfigs: FastGPTFeConfigsType = {
  show_emptyChat: true,
  show_git: false,
  docUrl: 'https://doc.fastgpt.io',
  openAPIDocUrl: 'https://doc.fastgpt.io/docs/openapi/intro',
  submitPluginRequestUrl: 'https://github.com/labring/fastgpt-plugin/issues',
  appTemplateCourse:
    'https://fael3z0zfze.feishu.cn/wiki/CX9wwMGyEi5TL6koiLYcg7U0nWb?fromScene=spaceOverview',
  systemTitle: 'FastGPT',
  concatMd:
    '项目开源地址: [FastGPT GitHub](https://github.com/labring/FastGPT)\n交流群: ![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu1.png)',
  limit: {
    exportDatasetLimitMinutes: 0,
    websiteSyncLimitMinuted: 0,
    workflowParallelRunMaxConcurrency: env.WORKFLOW_PARALLEL_MAX_CONCURRENCY
  },
  scripts: [],
  favicon: '/favicon.ico',
  chineseRedirectUrl: process.env.CHINESE_IP_REDIRECT_URL || '',
  uploadFileMaxSize: Number(process.env.UPLOAD_FILE_MAX_SIZE || 200),
  uploadFileMaxAmount: Number(process.env.UPLOAD_FILE_MAX_AMOUNT || 20)
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
      limit: {
        ...fileRes?.feConfigs?.limit,
        ...defaultFeConfigs.limit,
        ...(fastgptConfig.feConfigs?.limit || {})
      },
      isPlus: !!licenseData,
      hideChatCopyrightSetting: process.env.HIDE_CHAT_COPYRIGHT_SETTING === 'true',
      show_aiproxy: !!process.env.AIPROXY_API_ENDPOINT,
      show_coupon: process.env.SHOW_COUPON === 'true',
      show_discount_coupon: process.env.SHOW_DISCOUNT_COUPON === 'true',
      show_dataset_enhance: licenseData?.functions?.datasetEnhance,
      show_batch_eval: licenseData?.functions?.batchEval,
      show_agent_sandbox: !!env.AGENT_SANDBOX_PROVIDER,
      show_skill: env.SHOW_SKILL,
      show_evaluation: process.env.SHOW_EVALUATION === 'true',
      payFormUrl: process.env.PAY_FORM_URL || '',

      agentSandboxFree: process.env.AGENT_SANDBOX_FREE_TIP === 'true'
    },
    systemEnv: {
      ...fileRes.systemEnv,
      ...(fastgptConfig.systemEnv || {})
    },
    subPlans: fastgptConfig.subPlans
  };

  // set config
  initFastGPTConfig(config);

  logger.info('System config loaded', {
    fastgpt: {
      feConfigs: global.feConfigs,
      systemEnv: global.systemEnv,
      subPlans: global.subPlans,
      licenseData: global.licenseData
    }
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
    logger.error('Error initializing system plugin tags:', { error });
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
    logger.error('Error initializing system templates:', { error });
  }
}
