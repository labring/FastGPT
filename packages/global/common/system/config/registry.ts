export const systemInstanceConfigEditionList = ['community', 'pro', 'all'] as const;
export type SystemInstanceConfigEdition = (typeof systemInstanceConfigEditionList)[number];

export const systemInstanceConfigApplyModeList = [
  'live',
  'reload',
  'restart',
  'immutable'
] as const;
export type SystemInstanceConfigApplyMode = (typeof systemInstanceConfigApplyModeList)[number];

export const systemInstanceConfigSectionList = [
  'site',
  'auth',
  'security',
  'feature',
  'commercial',
  'resource',
  'performance',
  'storage',
  'vector',
  'providers',
  'subservice'
] as const;
export type SystemInstanceConfigSection = (typeof systemInstanceConfigSectionList)[number];

export const systemInstanceConfigDomainList = systemInstanceConfigSectionList;
export type SystemInstanceConfigDomain = SystemInstanceConfigSection;

export type SystemInstanceConfigRegistryItem = {
  key: string;
  section: SystemInstanceConfigSection;
  edition: SystemInstanceConfigEdition;
  /** 是否属于 SaaS 运营专用字段；为 true 时在私有化部署（ENABLE_SAAS_ADMIN_CONFIG=false）下默认隐藏 */
  isSaasOnly?: boolean;
  /** 是否属于深信服定制专用字段；为 true 时未开启 ENABLE_SANGFOR_ADMIN_CONFIG 默认隐藏 */
  isSangforOnly?: boolean;
  secret: boolean;
  applyMode: SystemInstanceConfigApplyMode;
};

const createEntries = ({
  section,
  keys,
  options
}: {
  section: SystemInstanceConfigSection;
  keys: readonly string[];
  options: Omit<
    SystemInstanceConfigRegistryItem,
    'key' | 'section' | 'isSaasOnly' | 'isSangforOnly'
  > & {
    isSaasOnly?: boolean;
    isSangforOnly?: boolean;
  };
}): SystemInstanceConfigRegistryItem[] =>
  keys.map((key) => ({
    key: `${section}.${key}`,
    section,
    isSaasOnly: options.isSaasOnly ?? false,
    isSangforOnly: options.isSangforOnly ?? false,
    ...options
  }));

/**
 * Admin 配置字段的展示与运行时元数据。字段的结构和默认值来自 SystemInstanceConfigSchema，这里只维护权限边界。
 *
 * 每个可配置的 Schema 叶子必须登记，版本权限与 UI 可见性由本表推导。
 * 保留在 ENV 的字段（例如同义词开关）不进入实例配置 Schema 和注册表，避免 API 接收后无人消费。
 */
export const systemInstanceConfigRegistry: readonly SystemInstanceConfigRegistryItem[] = [
  ...createEntries({
    section: 'site',
    keys: ['publicUrl'],
    options: { edition: 'all', secret: false, applyMode: 'live' }
  }),
  // 站点品牌与定制信息仅商业版可修改，菜单和 API 写入边界统一由字段归属推导。
  ...createEntries({
    section: 'site',
    keys: [
      'name',
      'description',
      'favicon',
      'docUrl',
      'openApiPrefix',
      'concatMd',
      'navbarItems',
      'appTemplateCourse',
      'loginGuideDocUrl',
      'customApiDomain',
      'customSharePageDomain',
      'botIframeUrl',
      'scripts'
    ],
    options: { edition: 'pro', secret: false, applyMode: 'live' }
  }),
  // 自定义域名入口与 CNAME 配置沿用旧页面“SaaS 服务才会用到”的定位
  ...createEntries({
    section: 'site',
    keys: [
      'customDomain.enable',
      'customDomain.domain.aliyun',
      'customDomain.domain.tencent',
      'customDomain.domain.volcengine'
    ],
    options: { edition: 'pro', secret: false, applyMode: 'live', isSaasOnly: true }
  }),
  ...createEntries({
    section: 'site',
    keys: ['customDomain.kc.aliyun', 'customDomain.kc.tencent', 'customDomain.kc.volcengine'],
    options: { edition: 'pro', secret: true, applyMode: 'live', isSaasOnly: true }
  }),
  ...createEntries({
    section: 'site',
    keys: [
      'customDomain.issuerServiceName.aliyun',
      'customDomain.issuerServiceName.tencent',
      'customDomain.issuerServiceName.volcengine',
      'customDomain.nginxServiceName.aliyun',
      'customDomain.nginxServiceName.tencent',
      'customDomain.nginxServiceName.volcengine'
    ],
    options: { edition: 'pro', secret: false, applyMode: 'live', isSaasOnly: true }
  }),
  ...createEntries({
    section: 'auth',
    keys: ['openApiKeyMaxCount'],
    options: { edition: 'all', secret: false, applyMode: 'live' }
  }),
  // 开源版账号与登录策略固定使用 Schema 默认值，配置入口仅限商业版。
  ...createEntries({
    section: 'auth',
    keys: ['passwordExpiredMonth'],
    options: { edition: 'pro', secret: false, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'auth',
    keys: ['fastLogin'],
    options: {
      edition: 'pro',
      secret: false,
      applyMode: 'live'
    }
  }),
  ...createEntries({
    section: 'auth',
    keys: ['sso.title', 'sso.icon', 'sso.autoLogin', 'sso.disablePasswordForSsoUsers'],
    options: { edition: 'pro', secret: false, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'auth',
    keys: [
      'loginProviders.email.smtp',
      'loginProviders.email.user',
      'loginProviders.email.port',
      'loginProviders.email.secure',
      'loginProviders.email.register',
      'loginProviders.sms.login.zh',
      'loginProviders.sms.register.zh',
      'loginProviders.sms.resetPassword.zh',
      'loginProviders.sms.changePassword.zh',
      'loginProviders.sms.bindNotification.zh',
      'loginProviders.sms.modelDeprecation.zh',
      'loginProviders.phone.accessKeyId',
      'loginProviders.phone.signName',
      'loginProviders.wechat.appId',
      'loginProviders.github.clientId',
      'loginProviders.google.clientId',
      'loginProviders.microsoft.clientId',
      'loginProviders.microsoft.tenantId',
      'accountCancellation.enabled',
      'accountCancellation.cancellationSm.zh',
      'accountCancellation.reminderSm.zh',
      'accountCancellation.todaySm.zh'
    ],
    options: { edition: 'pro', secret: false, applyMode: 'live' }
  }),
  // 企业微信服务商的全部配置只在 SaaS 模式下展示。
  ...createEntries({
    section: 'auth',
    keys: [
      'loginProviders.wecom.suiteId',
      'loginProviders.wecom.corpId',
      'loginProviders.wecom.buyerUserId',
      'loginProviders.wecom.basicVersionId',
      'loginProviders.wecom.advancedVersionId'
    ],
    options: { edition: 'pro', secret: false, applyMode: 'live', isSaasOnly: true }
  }),
  ...createEntries({
    section: 'auth',
    keys: [
      'loginProviders.email.pass',
      'loginProviders.phone.accessKeySecret',
      'loginProviders.wechat.appSecret',
      'loginProviders.github.secret',
      'loginProviders.google.secret',
      'loginProviders.microsoft.secret'
    ],
    options: { edition: 'pro', secret: true, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'auth',
    keys: [
      'loginProviders.wecom.secret',
      'loginProviders.wecom.token',
      'loginProviders.wecom.encodingAESKey',
      'loginProviders.wecom.providerSecret',
      'loginProviders.wecom.paySecret'
    ],
    options: { edition: 'pro', secret: true, applyMode: 'live', isSaasOnly: true }
  }),
  ...createEntries({
    section: 'security',
    keys: [
      'checkInternalIp',
      'csrfEnabled',
      'authCookieSecure',
      'allowedOriginsEnabled',
      'allowedOrigins',
      'skipFileTypeCheck',
      'checkExternalFile',
      'workflowHttpNode.ignoreHttpsCertificate',
      'fileUrlWhitelist'
    ],
    options: { edition: 'all', secret: false, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'security',
    keys: ['passwordLoginMinuteLimitCount', 'maxLoginSession'],
    options: { edition: 'pro', secret: false, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'feature',
    keys: ['multipleDataToBase64', 'agentEngine'],
    options: { edition: 'all', secret: false, applyMode: 'live' }
  }),
  // 社区版固定使用功能默认值；核心页的引擎与多模态设置仍独立配置。
  ...createEntries({
    section: 'feature',
    keys: [
      'hideChatCopyrightSetting',
      'enableTeamPluginUpload',
      'showOpenaiAccount',
      'enableTeamModel',
      'showDatasetFeishu',
      'showDatasetYuque',
      'showDatasetDingtalk',
      'showPublishFeishu',
      'showPublishDingtalk',
      'showPublishWecom',
      'showPublishOffiaccount',
      'showPublishWechat',
      'showComplianceCopywriting'
    ],
    options: { edition: 'pro', secret: false, applyMode: 'live' }
  }),
  // 营销与收款运营开关：私有化部署不展示，仅 SaaS 运营（ENABLE_SAAS_ADMIN_CONFIG）可配
  ...createEntries({
    section: 'commercial',
    keys: ['showCoupon', 'showDiscountCoupon', 'payFormUrl'],
    options: {
      edition: 'pro',
      secret: false,
      applyMode: 'live',
      isSaasOnly: true
    }
  }),
  ...createEntries({
    section: 'commercial',
    keys: [
      'payment.wx.appId',
      'payment.wx.mchId',
      'payment.wx.serialNo',
      'payment.wx.notifyUrl',
      'payment.alipay.appId',
      'payment.alipay.gateway',
      'payment.bank.description',
      'billingNotify.lackOfPoints.zh',
      'billingNotify.pointsThirtyPercentRemain.zh',
      'billingNotify.pointsTenPercentRemain.zh',
      'billingNotify.expireSoon.zh',
      'billingNotify.expired.zh'
    ],
    options: { edition: 'pro', secret: false, applyMode: 'live' }
  }),
  // 免费账号清理属于 SaaS 运营任务，通知模板只在 SaaS 表单展示
  ...createEntries({
    section: 'commercial',
    keys: ['billingNotify.freeClean.zh'],
    options: {
      edition: 'pro',
      secret: false,
      applyMode: 'live',
      isSaasOnly: true
    }
  }),
  ...createEntries({
    section: 'commercial',
    keys: [
      'payment.wx.apiV3Key',
      'payment.wx.privateKey',
      'payment.alipay.appPrivateKey',
      'payment.alipay.appCertContent',
      'payment.alipay.rootCertContent',
      'payment.alipay.publicCertContent'
    ],
    options: { edition: 'pro', secret: true, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'resource',
    keys: [
      'serviceRequestMaxContentLength',
      'maxFolderDepth',
      'appFolderMaxAmount',
      'datasetFolderMaxAmount',
      'uploadFileMaxSize',
      'uploadFileMaxAmount',
      'systemMaxStringLengthM'
    ],
    options: { edition: 'all', secret: false, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'resource',
    keys: ['exportDatasetLimitMinutes', 'websiteSyncLimitMinuted'],
    options: { edition: 'pro', secret: false, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'resource',
    keys: ['serviceAxiosMaxContentLength'],
    options: { edition: 'all', secret: false, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'resource',
    keys: ['evaluationMaxRows'],
    options: { edition: 'pro', secret: false, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'resource',
    keys: [
      'datasetArchive.maxFiles',
      'datasetArchive.maxSourceSizeMiB',
      'datasetArchive.maxConcurrency',
      'datasetArchive.prepareTimeoutSeconds'
    ],
    options: { edition: 'all', secret: false, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'performance',
    keys: [
      'workflow.maxRunTimes',
      'workflow.maxLoopTimes',
      'workflow.parallelMaxConcurrency',
      'parse.fileTimeoutSeconds',
      'parse.xlsxMaxRows',
      'parse.xlsxMaxColumns',
      'parse.xlsxMaxCells',
      'parse.xlsxMaxMergedCells',
      'parse.maxHtmlTransformChars',
      'dataset.parseMaxProcess',
      'dataset.vectorMaxProcess',
      'dataset.qaMaxProcess',
      'dataset.vlmMaxProcess',
      'chat.maxQpm',
      'tracking.retentionHours'
    ],
    options: { edition: 'all', secret: false, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'performance',
    keys: ['task.evalConcurrency'],
    options: { edition: 'pro', secret: false, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'storage',
    keys: ['fileDomain', 'downloadMode', 'externalEndpoint', 'cdnEndpoint', 'fileUrlExpiredDays'],
    options: {
      edition: 'all',
      secret: false,
      applyMode: 'reload'
    }
  }),
  ...createEntries({
    section: 'vector',
    keys: ['hnswEfSearch'],
    options: {
      edition: 'all',
      secret: false,
      applyMode: 'reload'
    }
  }),
  ...createEntries({
    section: 'vector',
    keys: ['vectorRecallConcurrency'],
    options: {
      edition: 'all',
      secret: false,
      applyMode: 'reload'
    }
  }),
  ...createEntries({
    section: 'providers',
    keys: [
      'documentParse.provider',
      'documentParse.customPdf.url',
      'documentParse.customPdf.somarkBaseUrl',
      'documentParse.customPdf.timeoutSeconds',
      'documentParse.customPdf.price',
      'externalProviderWorkflowVariables'
    ],
    options: { edition: 'all', secret: false, applyMode: 'reload' }
  }),
  // 深信服定制解析项默认隐藏，需 ENABLE_SANGFOR_ADMIN_CONFIG=true 才展示
  ...createEntries({
    section: 'providers',
    keys: ['documentParse.sangfor.url', 'documentParse.sangfor.extensions'],
    options: { edition: 'all', secret: false, applyMode: 'reload', isSangforOnly: true }
  }),
  ...createEntries({
    section: 'subservice',
    keys: ['codeSandbox.enabled', 'codeSandbox.url', 'mcp.enabled', 'mcp.sseProxyUrl'],
    options: { edition: 'all', secret: false, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'subservice',
    keys: ['codeSandbox.token'],
    options: { edition: 'all', secret: true, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'subservice',
    keys: [
      'agentSandbox.opensandbox.cpuOvercommitFactor',
      'agentSandbox.opensandbox.memoryOvercommitFactor'
    ],
    options: { edition: 'all', secret: false, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'subservice',
    keys: ['agentSandbox.enabled', 'agentSandbox.proxy.wsUrl', 'agentSandbox.proxy.previewUrl'],
    options: { edition: 'all', secret: false, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'subservice',
    keys: ['agentSandbox.proxy.secret'],
    options: { edition: 'all', secret: true, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'subservice',
    keys: [
      'agentSandbox.common.cpuCount',
      'agentSandbox.common.memoryMiB',
      'agentSandbox.common.storageSizeGi',
      'agentSandbox.common.suspendMinutes',
      'agentSandbox.common.archiveInactiveDays',
      'agentSandbox.common.maxEditDebug',
      'agentSandbox.common.maxPerTeam',
      'agentSandbox.common.npmRegistry',
      'agentSandbox.common.pypiIndexUrl',
      'agentSandbox.common.aptMirror',
      'agentSandbox.opensandbox.baseUrl',
      'agentSandbox.opensandbox.runtime',
      'agentSandbox.opensandbox.image',
      'agentSandbox.opensandbox.useServerProxy',
      'agentSandbox.opensandbox.volumeManagerUrl',
      'agentSandbox.opensandbox.volumeNamePrefix'
    ],
    options: { edition: 'all', secret: false, applyMode: 'restart' }
  }),
  ...createEntries({
    section: 'subservice',
    keys: ['agentSandbox.opensandbox.apiKey', 'agentSandbox.opensandbox.volumeManagerToken'],
    options: { edition: 'all', secret: true, applyMode: 'restart' }
  }),
  ...createEntries({
    section: 'providers',
    keys: [
      'documentParse.customPdf.key',
      'documentParse.customPdf.somarkApiKey',
      'documentParse.customPdf.doc2xKey',
      'documentParse.customPdf.textinAppId',
      'documentParse.customPdf.textinSecretCode'
    ],
    options: { edition: 'all', secret: true, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'providers',
    keys: ['documentParse.sangfor.key'],
    options: { edition: 'all', secret: true, applyMode: 'reload', isSangforOnly: true }
  })
];

/**
 * 按开源版/商业版以及可选的展示开关过滤 Admin 配置字段。
 * options.enableSaasAdminConfig / enableSangforAdminConfig 仅控制表单/UI 展示过滤，不作为 API 权限边界。
 */
export const getSystemInstanceConfigRegistry = (
  edition: SystemInstanceConfigEdition,
  options?: { enableSaasAdminConfig?: boolean; enableSangforAdminConfig?: boolean }
): SystemInstanceConfigRegistryItem[] =>
  systemInstanceConfigRegistry.filter((item) => {
    const editionAllowed = edition === 'all' || item.edition === 'all' || item.edition === edition;
    if (!editionAllowed) return false;
    if (item.isSaasOnly && !options?.enableSaasAdminConfig) return false;
    if (item.isSangforOnly && !options?.enableSangforAdminConfig) return false;
    return true;
  });
