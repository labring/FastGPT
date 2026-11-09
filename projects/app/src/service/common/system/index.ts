import fs from 'fs';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types/index';
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { initFastGPTConfig } from '@fastgpt/service/common/system/tools';
import { reloadSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import {
  computeSystemInitBufferId,
  getInstanceConfigVersionTag
} from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import json5 from 'json5';
import { defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import { MongoTemplateTypes } from '@fastgpt/service/core/app/templates/templateTypeSchema';
import {
  postCheckCensor,
  postConcatUsage,
  postCreateUsage,
  postPushUsageItems
} from '@fastgpt/service/thirdProvider/fastgptPro/api';
import type {
  PushUsageItemsProps,
  ConcatUsageProps,
  CreateUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import { isProVersion } from '@fastgpt/service/common/system/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { refreshLLMRequestRecordTTL } from '@fastgpt/service/core/ai/record/service';
import { getAgentSandboxSkillMaxBytes } from '@fastgpt/service/core/ai/sandbox/config';
import { serviceEnv } from '@fastgpt/service/env';
import { appEnv } from '@/env';
import { pluginTagList } from '@fastgpt/global/sdk/fastgpt-plugin';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { isLicenseActive } from '@fastgpt/global/common/system/license/utils';
import { applyRuntimeStorageConfig } from '@fastgpt/service/common/s3/config/constants';
import { initS3Buckets } from '@fastgpt/service/common/s3';
import { logInstanceConfigRead } from '@fastgpt/service/common/system/migrationCoverageLog';
import { buildAuthoritativeSystemEnv } from './buildAuthoritativeSystemEnv';
import { applyEnvAuthoritativeFeConfigs } from './envAuthoritativeFeConfigs';
import {
  buildOauthFeConfig,
  buildPayConfig,
  buildRegisterMethods,
  hasPayChannel
} from '@fastgpt/global/common/system/config/frontendProjection';

const logger = getLogger(LogCategories.SYSTEM);
const pluginFeaturesProbeTimeoutMs = 3000;

/* Init global variables */
export function initGlobalVariables() {
  function initPlusRequest() {
    global.textCensorHandler = function textCensorHandler({ text }: { text: string }) {
      if (!isProVersion()) return Promise.resolve({ code: 200 });
      return postCheckCensor({ text });
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
export async function getInitConfig({
  refreshLLMRequestRecordTTL = true
}: {
  refreshLLMRequestRecordTTL?: boolean;
} = {}) {
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

  await Promise.all([initSystemConfig({ refreshLLMRequestRecordTTL }), getSystemVersion()]);
}

const defaultFeConfigs: FastGPTFeConfigsType = {
  show_git: true,
  docUrl: 'https://doc.fastgpt.io',
  openAPIDocUrl: 'https://doc.fastgpt.io/openapi/intro',
  enable_team_plugin_upload: false,
  enable_team_model: false,
  appTemplateCourse:
    'https://fael3z0zfze.feishu.cn/wiki/CX9wwMGyEi5TL6koiLYcg7U0nWb?fromScene=spaceOverview',
  systemTitle: 'FastGPT',
  concatMd:
    '项目开源地址: [FastGPT GitHub](https://github.com/labring/FastGPT)\n交流群: ![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu1.png)',
  limit: {
    exportDatasetLimitMinutes: 0,
    websiteSyncLimitMinuted: 0,
    uploadFileMaxSize: 1000,
    uploadFileMaxAmount: 1000,
    skillSandboxMaxBytes: getAgentSandboxSkillMaxBytes(),
    workflowParallelRunMaxConcurrency: 10,
    maxFolderDepth: 4
  },
  scripts: [],
  favicon: '/favicon.ico'
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

let initConfigQueue: Promise<void> = Promise.resolve();

/**
 * 重新加载并应用全站系统配置。
 * 使用串行队列排队执行，确保并发重载按序完成，避免较早的重载在外部 I/O 慢时逆序覆写较新的运行时状态。
 */
export function initSystemConfig({
  refreshLLMRequestRecordTTL = true
}: {
  refreshLLMRequestRecordTTL?: boolean;
} = {}): Promise<void> {
  const current = initConfigQueue.then(() => doInitSystemConfig({ refreshLLMRequestRecordTTL }));
  initConfigQueue = current.catch(() => {});
  return current;
}

async function doInitSystemConfig({
  refreshLLMRequestRecordTTL: shouldRefreshLLMRequestRecordTTL
}: {
  refreshLLMRequestRecordTTL: boolean;
}) {
  const [
    { fastgptConfig, fastgptConfigTime, licenseData, licenseUpdateTime },
    pluginRemoteDebug,
    instanceConfig
  ] = await Promise.all([
    getFastGPTConfigFromDB(),
    getPluginRemoteDebugEnabled(),
    reloadSystemInstanceConfig()
  ]);
  logInstanceConfigRead({
    callsite: 'startup.app.system.initSystemConfig.snapshot',
    fields: [
      { path: 'site', value: instanceConfig.site },
      { path: 'auth', value: instanceConfig.auth },
      { path: 'security', value: instanceConfig.security },
      { path: 'feature', value: instanceConfig.feature },
      { path: 'commercial', value: instanceConfig.commercial },
      { path: 'resource', value: instanceConfig.resource },
      { path: 'performance', value: instanceConfig.performance },
      { path: 'storage', value: instanceConfig.storage },
      { path: 'vector', value: instanceConfig.vector },
      { path: 'providers', value: instanceConfig.providers },
      { path: 'subservice', value: instanceConfig.subservice }
    ]
  });
  // global 保留快照（含已到期），功能开关按授权是否有效计算，
  // 避免过期的商业版授权继续开启商业能力；前端据此可区分「未激活」与「已到期」。
  global.licenseData = licenseData;
  const isPlus = isLicenseActive(licenseData);
  // 支付渠道是实例配置的派生能力：旧库 feConfigs.payConfig 只是历史快照，
  // 新增渠道不可选、删除渠道后旧入口仍可见，必须在这里统一重算。
  const payConfig = buildPayConfig(instanceConfig.commercial);

  const config: FastGPTConfigFileType = {
    feConfigs: applyEnvAuthoritativeFeConfigs({
      ...defaultFeConfigs,
      ...(fastgptConfig.feConfigs || {}),

      // 权威数据源：优先从 SystemInstanceConfig 读取
      systemTitle: instanceConfig.site.name,
      systemDescription: instanceConfig.site.description,
      favicon: instanceConfig.site.favicon || '/favicon.ico',
      docUrl: instanceConfig.site.docUrl,
      openAPIDocUrl: instanceConfig.site.openApiDocUrl,
      loginGuideDocUrl: instanceConfig.site.loginGuideDocUrl,
      concatMd: instanceConfig.site.concatMd,
      appTemplateCourse: instanceConfig.site.appTemplateCourse,
      marketplaceUrl: instanceConfig.site.marketplaceUrl,
      navbarItems: instanceConfig.site.navbarItems,

      // 团队模式与 Pro getProTeamMode 共用同一份实例配置；社区版移除该 Pro 字段时
      // 保留旧库值，避免降级后把历史 multi/sync 模式误判为默认值。
      teamMode: instanceConfig.auth.teamMode ?? fastgptConfig.feConfigs?.teamMode,
      wecomLoginAutoRedirect: instanceConfig.auth.wecomLoginAutoRedirect,
      oauth: buildOauthFeConfig(instanceConfig.auth),
      register_method: buildRegisterMethods({
        legacyMethods: fastgptConfig.feConfigs?.register_method,
        auth: instanceConfig.auth
      }),
      accountCancellation: {
        enabled: instanceConfig.auth.accountCancellation.enabled
      },

      hideChatCopyrightSetting: instanceConfig.feature.hideChatCopyrightSetting,
      enable_team_plugin_upload: instanceConfig.feature.enableTeamPluginUpload,
      show_workflow_builder: instanceConfig.feature.showWorkflowBuilder,
      show_openai_account: instanceConfig.feature.showOpenaiAccount,
      enable_team_model: instanceConfig.feature.enableTeamModel,
      // Pro 保留其 ENV 下发值（默认 false），社区版使用 App ENV（默认 true）。
      show_git: serviceEnv.PRO_URL ? (fastgptConfig.feConfigs?.show_git ?? false) : appEnv.SHOW_GIT,
      show_dataset_feishu: instanceConfig.feature.showDatasetFeishu,
      show_dataset_yuque: instanceConfig.feature.showDatasetYuque,
      show_dataset_dingtalk: instanceConfig.feature.showDatasetDingtalk,
      show_publish_feishu: instanceConfig.feature.showPublishFeishu,
      show_publish_dingtalk: instanceConfig.feature.showPublishDingtalk,
      show_publish_wecom: instanceConfig.feature.showPublishWecom,
      show_publish_offiaccount: instanceConfig.feature.showPublishOffiaccount,
      show_publish_wechat: instanceConfig.feature.showPublishWechat,
      show_compliance_copywriting: instanceConfig.feature.showComplianceCopywriting,
      // 工单与企业认证入口由 Pro 根据实际服务配置决定，不按 PRO_URL 盲目展示
      show_workorder: Boolean(fastgptConfig.feConfigs?.show_workorder),
      show_enterprise_auth: Boolean(fastgptConfig.feConfigs?.show_enterprise_auth),
      enableSaasAdminConfig: serviceEnv.ENABLE_SAAS_ADMIN_CONFIG,

      show_coupon: instanceConfig.commercial.showCoupon,
      show_discount_coupon: instanceConfig.commercial.showDiscountCoupon,
      show_pay: hasPayChannel(payConfig),
      payConfig,
      payFormUrl: instanceConfig.commercial.payFormUrl,
      // 沙箱免费提示仍以 ENV 为权威，未迁入实例配置（Schema 无消费点）。
      agentSandboxFree: serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP,

      uploadFileMaxSize: instanceConfig.resource.uploadFileMaxSize,
      uploadFileMaxAmount: instanceConfig.resource.uploadFileMaxAmount,

      fileUrlWhitelist: instanceConfig.security.fileUrlWhitelist,
      externalProviderWorkflowVariables: instanceConfig.providers.externalProviderWorkflowVariables,

      // 权威数据源：实例配置优先（含已迁入的 ENV 初值及管理员显式清空的空值）
      customApiDomain: instanceConfig.site.customApiDomain,
      customSharePageDomain: instanceConfig.site.customSharePageDomain,
      scripts: instanceConfig.site.scripts,
      mcpServerProxyEndpoint: instanceConfig.subservice.mcp.sseProxyUrl,
      limit: {
        ...defaultFeConfigs.limit,
        ...(fastgptConfig.feConfigs?.limit || {}),
        uploadFileMaxSize: instanceConfig.resource.uploadFileMaxSize,
        uploadFileMaxAmount: instanceConfig.resource.uploadFileMaxAmount,
        maxFolderDepth: instanceConfig.resource.maxFolderDepth,
        exportDatasetLimitMinutes: instanceConfig.resource.exportDatasetLimitMinutes,
        websiteSyncLimitMinuted: instanceConfig.resource.websiteSyncLimitMinuted,
        workflowParallelRunMaxConcurrency:
          instanceConfig.performance.workflow.parallelMaxConcurrency
      },
      isPlus,
      // 仅表示是否接入 pro 服务（PRO_URL 已配置），与授权是否有效无关
      isProService: !!serviceEnv.PRO_URL,
      datasetSynonymEnabled: serviceEnv.DATASET_SYNONYM_ENABLED,
      show_dataset_enhance: licenseData?.functions?.datasetEnhance,
      show_intelligent_chunking: !!serviceEnv.SANGFOR_CHUNK_URL,
      show_batch_eval: licenseData?.functions?.eval,
      pluginRemoteDebug: instanceConfig.subservice.plugin.remoteDebug || pluginRemoteDebug,
      disableMarketplace: appEnv.DISABLE_MARKETPLACE,
      show_agent_sandbox_free_tip: serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP,
      agentSandboxProxyUrl: serviceEnv.AGENT_SANDBOX_PROXY_URL
    }),
    // 权威数据源：实例配置派生值盖过旧库 systemEnv，旧库仅保留 schema 外扩展键
    systemEnv: buildAuthoritativeSystemEnv({
      legacySystemEnv: fastgptConfig.systemEnv,
      instanceConfig
    }),
    subPlans: fastgptConfig.subPlans
  };

  // set config
  initFastGPTConfig(config);

  // 启动首次加载时实例配置迁移尚未完成，不能拿 Schema 默认值修改 Mongo TTL 索引；
  // 迁移后的 reload 以及 Watch/API 触发的普通 reload 才执行 TTL 同步。
  if (shouldRefreshLLMRequestRecordTTL) {
    await refreshLLMRequestRecordTTL();
  }

  // 存储运行策略（下载模式 / 公开地址）以实例配置为准，注入后按需重建 S3 bucket。
  // 启动首次调用时全局 bucket 尚未创建，由 instrumentation 的 init-s3-buckets 步骤完成构造。
  const storageConfigChanged = applyRuntimeStorageConfig(instanceConfig.storage);
  if (storageConfigChanged) {
    initS3Buckets();
  }

  const { refreshLangfuseTracing } = await import('@fastgpt/service/common/langfuse');
  await refreshLangfuseTracing();

  // 全部加载完成后统一设置确定性全局缓存标记，结合实例配置多域版本、实际授权版本和套餐版本
  global.systemInitBufferId = computeSystemInitBufferId({
    instanceVersionTag: getInstanceConfigVersionTag(),
    licenseUpdateTime,
    subPlansUpdateTime: fastgptConfigTime
  });

  logger.info('System config loaded', {
    instanceConfigVersion: getInstanceConfigVersionTag(),
    instanceConfigDomains: Object.keys(instanceConfig),
    feConfigCount: Object.keys(global.feConfigs ?? {}).length,
    systemEnvCount: Object.keys(global.systemEnv ?? {}).length,
    isPlus,
    isProService: !!serviceEnv.PRO_URL,
    storageConfigChanged
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
