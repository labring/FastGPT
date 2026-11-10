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
  options: Omit<SystemInstanceConfigRegistryItem, 'key' | 'section' | 'isSaasOnly'> & {
    isSaasOnly?: boolean;
  };
}): SystemInstanceConfigRegistryItem[] =>
  keys.map((key) => ({
    key: `${section}.${key}`,
    section,
    isSaasOnly: options.isSaasOnly ?? false,
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
    keys: [
      'name',
      'description',
      'favicon',
      'marketplaceUrl',
      'docUrl',
      'openApiDocUrl',
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
    options: { edition: 'all', secret: false, applyMode: 'live' }
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
    options: { edition: 'all', secret: false, applyMode: 'live', isSaasOnly: true }
  }),
  ...createEntries({
    section: 'auth',
    keys: ['openApiKeyMaxCount', 'passwordExpiredMonth', 'wecomLoginAutoRedirect'],
    options: { edition: 'all', secret: false, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'auth',
    keys: ['teamMode', 'fastLogin'],
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
      'loginProviders.phone.accessKeyId',
      'loginProviders.phone.signName',
      'loginProviders.wechat.appId',
      'loginProviders.wecom.suiteId',
      'loginProviders.wecom.corpId',
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
  // 企微服务商运营字段：仅 SaaS 开启时在管理端表单展示
  ...createEntries({
    section: 'auth',
    keys: [
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
      'loginProviders.wecom.secret',
      'loginProviders.wecom.token',
      'loginProviders.wecom.encodingAESKey',
      'loginProviders.github.secret',
      'loginProviders.google.secret',
      'loginProviders.microsoft.secret'
    ],
    options: { edition: 'pro', secret: true, applyMode: 'live' }
  }),
  ...createEntries({
    section: 'auth',
    keys: ['loginProviders.wecom.providerSecret', 'loginProviders.wecom.paySecret'],
    options: { edition: 'pro', secret: true, applyMode: 'live', isSaasOnly: true }
  }),
  ...createEntries({
    section: 'security',
    keys: [
      'checkInternalIp',
      'csrfEnabled',
      'passwordLoginMinuteLimitCount',
      'maxLoginSession',
      'allowedOrigins',
      'skipFileTypeCheck',
      'checkExternalFile',
      'workflowHttpNode.ignoreHttpsCertificate',
      'fileUrlWhitelist'
    ],
    options: { edition: 'all', secret: false, applyMode: 'live' }
  }),
  // 内容审核只在 Pro 实现，社区版不展示相关凭据入口
  ...createEntries({
    section: 'security',
    keys: ['censor.baiduClientId', 'censor.customCensorUrl'],
    options: {
      edition: 'pro',
      secret: false,
      applyMode: 'live'
    }
  }),
  ...createEntries({
    section: 'security',
    keys: ['censor.baiduClientSecret'],
    options: {
      edition: 'pro',
      secret: true,
      applyMode: 'live'
    }
  }),
  ...createEntries({
    section: 'feature',
    keys: [
      'hideChatCopyrightSetting',
      'multipleDataToBase64',
      'agentEngine',
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
    options: { edition: 'all', secret: false, applyMode: 'live' }
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
      'payment.alipay.endpoint',
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
      'systemMaxStringLengthM',
      'exportDatasetLimitMinutes',
      'websiteSyncLimitMinuted'
    ],
    options: { edition: 'all', secret: false, applyMode: 'reload' }
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
      'tracking.retentionHours',
      'task.evalConcurrency',
      'channel.wechatConcurrency'
    ],
    options: { edition: 'all', secret: false, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'storage',
    keys: [
      'downloadMode',
      'externalEndpoint',
      'cdnEndpoint',
      'fileUrlExpiredDays',
      'redirectTtlSeconds'
    ],
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
      edition: 'pro',
      secret: false,
      applyMode: 'reload'
    }
  }),
  ...createEntries({
    section: 'providers',
    keys: [
      'documentParse.provider',
      'documentParse.customPdf.url',
      'documentParse.customPdf.price',
      'documentParse.sangfor.url',
      'documentParse.sangfor.extensions',
      'documentParse.sangfor.timeoutSeconds',
      'dataSource.feishuBaseUrl',
      'dataSource.dingtalkBaseUrl',
      'dataSource.dingtalkOapiBaseUrl',
      'dataSource.yuqueDatasetBaseUrl',
      'externalProviderWorkflowVariables'
    ],
    options: { edition: 'all', secret: false, applyMode: 'reload' }
  }),
  ...createEntries({
    section: 'subservice',
    keys: [
      'plugin.remoteDebug',
      'codeSandbox.enabled',
      'aiProxy.enabled',
      'mcp.sseProxyUrl',
      'agentSandbox.provider',
      'agentSandbox.common.cpuCount',
      'agentSandbox.common.memoryMiB',
      'agentSandbox.common.storageSizeGi',
      'agentSandbox.common.suspendMinutes',
      'agentSandbox.common.archiveInactiveDays',
      'agentSandbox.common.maxEditDebug',
      'agentSandbox.common.maxPerTeam',
      'agentSandbox.common.entrypointTimeoutSeconds',
      'agentSandbox.common.wsMaxMessageBytes',
      'agentSandbox.common.wsMaxFrameBytes',
      'agentSandbox.common.npmRegistry',
      'agentSandbox.common.pypiIndexUrl',
      'agentSandbox.common.aptMirror',
      'agentSandbox.sealosdevbox.baseUrl',
      'agentSandbox.sealosdevbox.workDirectory',
      'agentSandbox.sealosdevbox.image',
      'agentSandbox.opensandbox.baseUrl',
      'agentSandbox.opensandbox.runtime',
      'agentSandbox.opensandbox.image',
      'agentSandbox.opensandbox.useServerProxy',
      'agentSandbox.opensandbox.volumeManagerUrl',
      'agentSandbox.opensandbox.volumeNamePrefix'
    ],
    options: { edition: 'pro', secret: false, applyMode: 'restart' }
  }),
  ...createEntries({
    section: 'subservice',
    keys: [
      'agentSandbox.sealosdevbox.token',
      'agentSandbox.opensandbox.apiKey',
      'agentSandbox.opensandbox.volumeManagerToken'
    ],
    options: { edition: 'pro', secret: true, applyMode: 'restart' }
  }),
  ...createEntries({
    section: 'providers',
    keys: [
      'documentParse.customPdf.key',
      'documentParse.customPdf.somarkApiKey',
      'documentParse.customPdf.doc2xKey',
      'documentParse.customPdf.textinAppId',
      'documentParse.customPdf.textinSecretCode',
      'documentParse.sangfor.key'
    ],
    options: { edition: 'all', secret: true, applyMode: 'reload' }
  })
];

/**
 * 按开源版/商业版以及可选的 SaaS 开关过滤 Admin 配置字段。
 * options.enableSaasAdminConfig 仅控制表单/UI 展示过滤，不作为 API 权限边界。
 */
export const getSystemInstanceConfigRegistry = (
  edition: SystemInstanceConfigEdition,
  options?: { enableSaasAdminConfig?: boolean }
): SystemInstanceConfigRegistryItem[] =>
  systemInstanceConfigRegistry.filter((item) => {
    const editionAllowed = edition === 'all' || item.edition === 'all' || item.edition === edition;
    if (!editionAllowed) return false;
    if (item.isSaasOnly && !options?.enableSaasAdminConfig) return false;
    return true;
  });
