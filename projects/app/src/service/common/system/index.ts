import fs from 'fs';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types/index';
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { initFastGPTConfig } from '@fastgpt/service/common/system/tools';
import { reloadSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import json5 from 'json5';
import { defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import { MongoTemplateTypes } from '@fastgpt/service/core/app/templates/templateTypeSchema';
import {
  postCheckCensor,
  postConcatUsage,
  postCreateUsage,
  postDeepRag,
  postPushUsageItems
} from '@fastgpt/service/thirdProvider/fastgptPro/api';
import type { DeepRagSearchProps } from '@fastgpt/service/core/dataset/search';
import type {
  PushUsageItemsProps,
  ConcatUsageProps,
  CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import { isProVersion } from '@fastgpt/service/common/system/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  getAgentSandboxArchiveMaxBytes,
  getAgentSandboxMaxFileBytes,
  getAgentSandboxSkillMaxBytes
} from '@fastgpt/service/core/ai/sandbox/interface/config';
import { serviceEnv } from '@fastgpt/service/env';
import { appEnv } from '@/env';
import { pluginTagList } from '@fastgpt/global/sdk/fastgpt-plugin';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { isLicenseActive } from '@fastgpt/global/common/system/license/utils';
import { applyRuntimeStorageConfig } from '@fastgpt/service/common/s3/config/constants';
import { initS3Buckets } from '@fastgpt/service/common/s3';
import { buildAuthoritativeSystemEnv } from './buildAuthoritativeSystemEnv';

const logger = getLogger(LogCategories.SYSTEM);
const pluginFeaturesProbeTimeoutMs = 3000;
const defaultOpenSourceLoginGuideDocUrl =
  'https://doc.fastgpt.io/zh-CN/guide/version/cloud/faq#%E8%B4%A6%E5%8F%B7%E7%99%BB%E5%BD%95%E9%97%AE%E9%A2%98';

/**
 * 解析环境变量注入的全站脚本列表（JSON 字符串）。
 * 格式非法时仅记录告警并返回空数组，避免一个配置错误导致全站不可用。
 */
function parseEnvScripts(raw?: string): FastGPTFeConfigsType['scripts'] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('SCRIPTS must be a JSON array');
    return parsed.filter(
      (item): item is Record<string, string> =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
    );
  } catch (error) {
    logger.warn('Invalid SCRIPTS env: expected JSON array, ignored', { error });
    return [];
  }
}

/* Init global variables */
export function initGlobalVariables() {
  function initPlusRequest() {
    global.textCensorHandler = function textCensorHandler({ text }: { text: string }) {
      if (!isProVersion()) return Promise.resolve({ code: 200 });
      return postCheckCensor({ text });
    };

    global.deepRagHandler = function deepRagHandler(data: DeepRagSearchProps) {
      return postDeepRag(data);
    };

    global.createUsageHandler = function createUsageHandler(data: CreateUsageProps) {
      if (!isProVersion()) return;
      return postCreateUsage(data);
    };
    global.concatUsageHandler = function concatUsageHandler(data: ConcatUsageProps) {
      if (!isProVersion()) return;
      return postConcatUsage(data);
    };
    global.pushUsageItemsHandler = function pushUsageItemsHandler(data: PushUsageItemsProps) {
      if (!isProVersion()) return;
      return postPushUsageItems(data);
    };
  }

  global.datasetParseQueueLen = global.datasetParseQueueLen ?? 0;
  global.qaQueueLen = global.qaQueueLen ?? 0;
  global.vectorQueueLen = global.vectorQueueLen ?? 0;
  global.synonymQueueLen = global.synonymQueueLen ?? 0;
  global.preCreatedQueueLen = global.preCreatedQueueLen ?? 0;
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
      logger.info('System version resolved', { systemVersion: global.systemVersion });
    } catch (error) {
      logger.error('System version resolve failed', { error });

      global.systemVersion = '0.0.0';
    }
  };

  await Promise.all([initSystemConfig(), getSystemVersion()]);
}

const defaultFeConfigs: FastGPTFeConfigsType = {
  show_git: true,
  docUrl: 'https://doc.fastgpt.io',
  openAPIDocUrl: 'https://doc.fastgpt.io/openapi/intro',
  enable_team_plugin_upload: false,
  appTemplateCourse:
    'https://fael3z0zfze.feishu.cn/wiki/CX9wwMGyEi5TL6koiLYcg7U0nWb?fromScene=spaceOverview',
  systemTitle: 'FastGPT',
  concatMd:
    '项目开源地址: [FastGPT GitHub](https://github.com/labring/FastGPT)\n交流群: ![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu1.png)',
  limit: {
    exportDatasetLimitMinutes: 0,
    websiteSyncLimitMinuted: 0,
    agentSandboxMaxEditDebug: serviceEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG,
    agentSandboxArchiveMaxBytes: getAgentSandboxArchiveMaxBytes(),
    skillSandboxMaxBytes: getAgentSandboxSkillMaxBytes(),
    agentSandboxMaxFileBytes: getAgentSandboxMaxFileBytes(),
    workflowParallelRunMaxConcurrency: serviceEnv.WORKFLOW_PARALLEL_MAX_CONCURRENCY,
    maxFolderDepth: serviceEnv.MAX_FOLDER_DEPTH
  },
  scripts: [],
  favicon: '/favicon.ico',
  chineseRedirectUrl: appEnv.CHINESE_IP_REDIRECT_URL,
  uploadFileMaxSize: serviceEnv.UPLOAD_FILE_MAX_SIZE,
  uploadFileMaxAmount: serviceEnv.UPLOAD_FILE_MAX_AMOUNT
};

async function getPluginRemoteDebugEnabled() {
  try {
    const features = await pluginClient.getPluginServiceFeatures({
      signal: AbortSignal.timeout(pluginFeaturesProbeTimeoutMs)
    });
    return features.remoteDebug === true;
  } catch (error) {
    logger.warn('Plugin service features resolve failed', { error });
    return false;
  }
}

export async function initSystemConfig() {
  const [{ fastgptConfig, licenseData }, pluginRemoteDebug, instanceConfig] = await Promise.all([
    getFastGPTConfigFromDB(),
    getPluginRemoteDebugEnabled(),
    reloadSystemInstanceConfig()
  ]);
  // global 保留快照（含已到期），功能开关按授权是否有效计算，
  // 避免过期的商业版授权继续开启商业能力；前端据此可区分「未激活」与「已到期」。
  global.licenseData = licenseData;
  const isPlus = isLicenseActive(licenseData);

  const config: FastGPTConfigFileType = {
    feConfigs: {
      ...defaultFeConfigs,
      ...(fastgptConfig.feConfigs || {}),

      // 权威数据源：优先从 SystemInstanceConfig 读取
      systemTitle: instanceConfig.site.name,
      favicon: instanceConfig.site.favicon || '/favicon.ico',
      docUrl: instanceConfig.site.docUrl,
      openAPIDocUrl: instanceConfig.site.openApiDocUrl,
      loginGuideDocUrl: instanceConfig.site.loginGuideDocUrl,
      concatMd: instanceConfig.site.concatMd,
      appTemplateCourse: instanceConfig.site.appTemplateCourse,
      marketplaceUrl: instanceConfig.site.marketplaceUrl || appEnv.MARKETPLACE_URL,
      navbarItems: instanceConfig.site.navbarItems,

      wecomLoginAutoRedirect: instanceConfig.auth.wecomLoginAutoRedirect,

      hideChatCopyrightSetting: instanceConfig.feature.hideChatCopyrightSetting,
      enable_team_plugin_upload: instanceConfig.feature.enableTeamPluginUpload,
      show_emptyChat: instanceConfig.feature.showEmptyChat,
      show_git: appEnv.SHOW_GIT,
      show_dataset_feishu: instanceConfig.feature.showDatasetFeishu,
      show_dataset_yuque: instanceConfig.feature.showDatasetYuque,
      show_dataset_dingtalk: instanceConfig.feature.showDatasetDingtalk,
      show_publish_feishu: instanceConfig.feature.showPublishFeishu,
      show_publish_dingtalk: instanceConfig.feature.showPublishDingtalk,
      show_publish_wecom: instanceConfig.feature.showPublishWecom,
      show_publish_offiaccount: instanceConfig.feature.showPublishOffiaccount,
      show_publish_wechat: instanceConfig.feature.showPublishWechat,
      show_compliance_copywriting: instanceConfig.feature.showComplianceCopywriting,
      show_workorder: Boolean(serviceEnv.PRO_URL),
      show_enterprise_auth: isPlus && Boolean(serviceEnv.PRO_URL),

      show_coupon: instanceConfig.commercial.showCoupon,
      show_discount_coupon: instanceConfig.commercial.showDiscountCoupon,
      payFormUrl: instanceConfig.commercial.payFormUrl || appEnv.PAY_FORM_URL || '',
      agentSandboxFree: instanceConfig.commercial.agentSandboxFreeTip,

      uploadFileMaxSize: instanceConfig.resource.uploadFileMaxSize,
      uploadFileMaxAmount: instanceConfig.resource.uploadFileMaxAmount,

      fileUrlWhitelist: instanceConfig.security.fileUrlWhitelist,
      externalProviderWorkflowVariables: instanceConfig.providers.externalProviderWorkflowVariables,

      // 部署绑定项永久由环境变量注入，优先级高于旧数据库值
      customApiDomain: appEnv.CUSTOM_API_DOMAIN || '',
      customSharePageDomain: appEnv.CUSTOM_SHARE_PAGE_DOMAIN || '',
      scripts: parseEnvScripts(appEnv.SCRIPTS),
      mcpServerProxyEndpoint: instanceConfig.subservice.mcp.sseProxyUrl,
      limit: {
        ...defaultFeConfigs.limit,
        ...(fastgptConfig.feConfigs?.limit || {}),
        maxFolderDepth: instanceConfig.resource.maxFolderDepth,
        exportDatasetLimitMinutes: instanceConfig.resource.exportDatasetLimitMinutes,
        websiteSyncLimitMinuted: instanceConfig.resource.websiteSyncLimitMinuted,
        workflowParallelRunMaxConcurrency:
          instanceConfig.performance.workflow.parallelMaxConcurrency
      },
      isPlus,
      // 仅表示是否接入 pro 服务（PRO_URL 已配置），与授权是否有效无关
      isProService: !!serviceEnv.PRO_URL,
      show_dataset_enhance: licenseData?.functions?.datasetEnhance,
      show_intelligent_chunking: !!serviceEnv.SANGFOR_CHUNK_URL,
      show_batch_eval: licenseData?.functions?.eval,
      pluginRemoteDebug: instanceConfig.subservice.plugin.remoteDebug || pluginRemoteDebug,
      disableMarketplace: appEnv.DISABLE_MARKETPLACE,
      // 上游新增的强制展示免费标签开关：显式开启时盖过实例配置的免费期判定
      show_agent_sandbox_free_tip:
        appEnv.AGENT_SANDBOX_SHOW_FREE_TIP || instanceConfig.commercial.agentSandboxFreeTip,
      agentSandboxProxyUrl:
        instanceConfig.subservice.agentSandbox.proxy.wsUrl ||
        serviceEnv.AGENT_SANDBOX_PROXY_URL ||
        ''
    },
    // 权威数据源：实例配置派生值盖过旧库 systemEnv，旧库仅保留 schema 外扩展键
    systemEnv: buildAuthoritativeSystemEnv({
      legacySystemEnv: fastgptConfig.systemEnv,
      instanceConfig
    }),
    subPlans: fastgptConfig.subPlans
  };

  // set config
  initFastGPTConfig(config);

  // 存储运行策略（下载模式 / 公开地址）以实例配置为准，注入后按需重建 S3 bucket。
  // 启动首次调用时全局 bucket 尚未创建，由 instrumentation 的 init-s3-buckets 步骤完成构造。
  const storageConfigChanged = applyRuntimeStorageConfig(instanceConfig.storage);
  if (storageConfigChanged) {
    initS3Buckets();
  }

  const { refreshLangfuseTracing } = await import('@fastgpt/service/common/langfuse');
  await refreshLangfuseTracing();

  logger.info('System config loaded', {
    fastgpt: {
      feConfigs: global.feConfigs,
      systemEnv: global.systemEnv,
      subPlans: global.subPlans,
      licenseData: global.licenseData,
      instanceConfig
    }
  });
}

export async function initSystemPluginTags() {
  try {
    const tags = pluginTagList;

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
        return MongoTemplateTypes.updateOne(
          {
            typeId: templateType.typeId
          },
          {
            $set: {
              typeId: templateType.typeId,
              typeName: templateType.typeName
            }
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
