import type { SystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { isLicenseActive } from '@fastgpt/global/common/system/license/utils';
import {
  buildAuthMethodProjection,
  buildCustomDomainFeConfig,
  buildOauthFeConfig,
  buildPayConfig,
  hasPayChannel
} from '@fastgpt/global/common/system/config/frontendProjection';
import { isValidServiceBaseUrl } from '@fastgpt/global/common/string/url';
import { serviceEnv } from '../../../env';
import { resolveFeatureConfigForEdition } from '@fastgpt/global/common/system/config/feature';

export type FrontendConfigContext = {
  /** Pro 本进程不要求 PRO_URL 指向自身；App 缺省按服务连接参数判断。 */
  commercialService?: boolean;
  pluginRemoteDebug?: boolean;
  disableMarketplace?: boolean;
  showGit?: boolean;
  chineseRedirectUrl?: string;
  wecomLoginAutoRedirect?: boolean;
};

/** 只选择客户端允许的字段；显式接收候选快照，构建过程中不读取已发布 global。 */
export const buildSystemFrontendConfig = (
  instanceConfig: SystemInstanceConfig,
  context: FrontendConfigContext = {}
): FastGPTFeConfigsType => {
  const commercialService = context.commercialService ?? Boolean(serviceEnv.PRO_URL);
  const feature = resolveFeatureConfigForEdition({
    config: instanceConfig?.feature,
    commercialService
  });
  const licenseData = commercialService ? instanceConfig?.license?.data : undefined;
  const proEnv = commercialService
    ? instanceConfig?.proEnv
    : {
        teamMode: 'single' as const,
        ssoUrl: '',
        login2faEnabled: false,
        show_workorder: false,
        show_enterprise_auth: false,
        showWecomConfig: false
      };
  const isPlus = isLicenseActive(licenseData);
  const payConfig = buildPayConfig(instanceConfig?.commercial);
  const authMethods = buildAuthMethodProjection({
    auth: instanceConfig?.auth,
    legacyRegisterMethods: proEnv.teamMode === 'sync' ? ['sync'] : []
  });
  const pluginRemoteDebug = context.pluginRemoteDebug ?? false;
  const feConfigs: FastGPTFeConfigsType = {
    // 权威数据源：优先从 SystemInstanceConfig 读取
    systemTitle: instanceConfig?.site?.name,
    systemDescription: instanceConfig?.site?.description,
    favicon: instanceConfig?.site?.favicon || '/favicon.ico',
    docUrl: instanceConfig?.site?.docUrl,
    loginGuideDocUrl: instanceConfig?.site?.loginGuideDocUrl,
    concatMd: instanceConfig?.site?.concatMd,
    appTemplateCourse: instanceConfig?.site?.appTemplateCourse,
    marketplaceUrl: serviceEnv.MARKETPLACE_URL,
    navbarItems: instanceConfig?.site?.navbarItems,

    // 团队模式由 Pro ENV 控制，Pro 重启时刷新此共享快照；实例 auth.teamMode 不能覆盖。
    teamMode: proEnv.teamMode ?? 'single',
    wecomLoginAutoRedirect: context.wecomLoginAutoRedirect ?? false,
    oauth: buildOauthFeConfig(instanceConfig?.auth),
    sso: {
      title: instanceConfig?.auth?.sso?.title,
      icon: instanceConfig?.auth?.sso?.icon,
      autoLogin: instanceConfig?.auth?.sso?.autoLogin,
      disablePasswordForSsoUsers: instanceConfig?.auth?.sso?.disablePasswordForSsoUsers
    },
    login_method: authMethods.login_method,
    register_method: authMethods.register_method,
    find_password_method: authMethods.find_password_method,
    bind_notification_method: authMethods.bind_notification_method,
    accountCancellation: {
      enabled: instanceConfig?.auth?.accountCancellation?.enabled
    },

    hideChatCopyrightSetting: feature.hideChatCopyrightSetting,
    enable_team_plugin_upload: feature.enableTeamPluginUpload,
    show_openai_account: feature.showOpenaiAccount,
    enable_team_model: feature.enableTeamModel,
    show_dataset_feishu: feature.showDatasetFeishu,
    show_dataset_yuque: feature.showDatasetYuque,
    show_dataset_dingtalk: feature.showDatasetDingtalk,
    show_publish_feishu: feature.showPublishFeishu,
    show_publish_dingtalk: feature.showPublishDingtalk,
    show_publish_wecom: feature.showPublishWecom,
    show_publish_offiaccount: feature.showPublishOffiaccount,
    show_publish_wechat: feature.showPublishWechat,
    show_compliance_copywriting: feature.showComplianceCopywriting,
    // 工单与企业认证入口由 Pro 根据实际服务配置决定，不按 PRO_URL 盲目展示
    show_workorder: Boolean(proEnv.show_workorder),
    show_enterprise_auth: Boolean(proEnv.show_enterprise_auth),
    enableSaasAdminConfig: serviceEnv.ENABLE_SAAS_ADMIN_CONFIG,

    show_coupon: instanceConfig?.commercial?.showCoupon,
    show_discount_coupon: instanceConfig?.commercial?.showDiscountCoupon,
    show_pay: hasPayChannel(payConfig),
    payConfig,
    payFormUrl: instanceConfig?.commercial?.payFormUrl,
    // 沙箱免费提示仍以 ENV 为权威，未迁入实例配置（Schema 无消费点）。

    uploadFileMaxSize: instanceConfig?.resource?.uploadFileMaxSize,
    uploadFileMaxAmount: instanceConfig?.resource?.uploadFileMaxAmount,

    fileUrlWhitelist: instanceConfig?.security?.fileUrlWhitelist,
    externalProviderWorkflowVariables: instanceConfig?.providers?.externalProviderWorkflowVariables,

    // 权威数据源：实例配置优先（含已迁入的 ENV 初值及管理员显式清空的空值）
    customApiDomain: instanceConfig?.site?.customApiDomain,
    customSharePageDomain: instanceConfig?.site?.customSharePageDomain,
    customDomain: buildCustomDomainFeConfig(instanceConfig?.site?.customDomain),
    botIframeUrl: instanceConfig?.site?.botIframeUrl,
    scripts: instanceConfig?.site?.scripts,
    mcpServerProxyEndpoint:
      instanceConfig?.subservice?.mcp?.enabled &&
      typeof instanceConfig?.subservice?.mcp?.sseProxyUrl === 'string' &&
      isValidServiceBaseUrl(instanceConfig.subservice.mcp.sseProxyUrl)
        ? instanceConfig?.subservice?.mcp?.sseProxyUrl?.trim()
        : undefined,
    codeSandboxEnabled:
      instanceConfig?.subservice?.codeSandbox?.enabled &&
      typeof instanceConfig?.subservice?.codeSandbox?.url === 'string' &&
      isValidServiceBaseUrl(instanceConfig.subservice.codeSandbox.url) &&
      typeof instanceConfig?.subservice?.codeSandbox?.token === 'string' &&
      Boolean(instanceConfig.subservice.codeSandbox.token.trim()),
    limit: {
      skillSandboxMaxBytes:
        Math.round(
          (instanceConfig?.subservice?.agentSandbox?.common?.storageSizeGi * 1024) / 2 - 150
        ) *
        1024 ** 2,

      uploadFileMaxSize: instanceConfig?.resource?.uploadFileMaxSize,
      uploadFileMaxAmount: instanceConfig?.resource?.uploadFileMaxAmount,
      maxFolderDepth: instanceConfig?.resource?.maxFolderDepth,
      exportDatasetLimitMinutes: instanceConfig?.resource?.exportDatasetLimitMinutes,
      websiteSyncLimitMinuted: instanceConfig?.resource?.websiteSyncLimitMinuted,
      workflowParallelRunMaxConcurrency:
        instanceConfig?.performance?.workflow?.parallelMaxConcurrency
    },
    isPlus,
    // 仅表示是否接入 pro 服务（PRO_URL 已配置），与授权是否有效无关
    isProService: commercialService,
    datasetSynonymEnabled: serviceEnv.DATASET_SYNONYM_ENABLED,
    show_dataset_enhance: licenseData?.functions?.datasetEnhance,
    show_intelligent_chunking: !!serviceEnv.SANGFOR_CHUNK_URL,
    pluginRemoteDebug,
    disableMarketplace: context.disableMarketplace ?? false,
    show_agent_sandbox_free_tip: serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP,
    show_agent_sandbox: instanceConfig?.subservice?.agentSandbox?.provider !== 'none',
    showCustomPdfParse: instanceConfig?.providers?.documentParse?.provider !== 'none',
    customPdfParsePrice: instanceConfig?.providers?.documentParse?.customPdf?.price,
    show_outlink_brand: serviceEnv.SHOW_OUTLINK_BRAND,
    show_git: serviceEnv.PRO_URL ? (context.showGit ?? false) : true,
    chineseRedirectUrl: context.chineseRedirectUrl,
    login2faEnabled: proEnv.login2faEnabled,
    showWecomConfig: proEnv.showWecomConfig,
    agentSandboxProxyUrl: instanceConfig?.subservice?.agentSandbox?.proxy?.wsUrl
  };
  feConfigs.sso = { ...feConfigs.sso, enabled: Boolean(proEnv.ssoUrl) };
  if (
    !isPlus &&
    instanceConfig?.site?.loginGuideDocUrl ===
      'https://doc.fastgpt.io/zh-CN/guide/version/cloud/faq#%E8%B4%A6%E5%8F%B7%E7%99%BB%E5%BD%95%E9%97%AE%E9%A2%98'
  ) {
    feConfigs.loginGuideDocUrl =
      'https://doc.fastgpt.cn/guide/version/cloud/faq#%E8%B4%A6%E5%8F%B7%E7%99%BB%E5%BD%95%E9%97%AE%E9%A2%98';
  }
  return feConfigs;
};
