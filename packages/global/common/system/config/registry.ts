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
  secret: boolean;
  applyMode: SystemInstanceConfigApplyMode;
};

const createEntries = (
  section: SystemInstanceConfigSection,
  keys: readonly string[],
  options: Omit<SystemInstanceConfigRegistryItem, 'key' | 'section'>
): SystemInstanceConfigRegistryItem[] =>
  keys.map((key) => ({
    key: `${section}.${key}`,
    section,
    ...options
  }));

/**
 * Admin 配置字段的展示与运行时元数据。字段的结构和默认值来自 SystemInstanceConfigSchema，这里只维护权限边界。
 */
export const systemInstanceConfigRegistry: readonly SystemInstanceConfigRegistryItem[] = [
  ...createEntries(
    'site',
    [
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
      'scripts'
    ],
    { edition: 'all', secret: false, applyMode: 'live' }
  ),
  ...createEntries(
    'auth',
    [
      'openApiKeyMaxCount',
      'passwordExpiredMonth',
      'wecomLoginAutoRedirect',
      'defaultTeamBasicPermissionsEnabled'
    ],
    { edition: 'all', secret: false, applyMode: 'live' }
  ),
  ...createEntries('auth', ['teamMode', 'fastLogin'], {
    edition: 'pro',
    secret: false,
    applyMode: 'live'
  }),
  ...createEntries(
    'auth',
    [
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
      'loginProviders.wecom.buyerUserId',
      'loginProviders.wecom.basicVersionId',
      'loginProviders.wecom.advancedVersionId',
      'loginProviders.github.clientId',
      'loginProviders.google.clientId',
      'loginProviders.microsoft.clientId',
      'loginProviders.microsoft.tenantId',
      'loginProviders.microsoft.customButton',
      'loginProviders.dingtalk.clientId',
      'accountCancellation.enabled',
      'accountCancellation.cancellationSm.zh',
      'accountCancellation.reminderSm.zh',
      'accountCancellation.todaySm.zh'
    ],
    { edition: 'pro', secret: false, applyMode: 'live' }
  ),
  ...createEntries(
    'auth',
    [
      'loginProviders.email.pass',
      'loginProviders.phone.accessKeySecret',
      'loginProviders.wechat.appSecret',
      'loginProviders.wecom.secret',
      'loginProviders.wecom.token',
      'loginProviders.wecom.encodingAESKey',
      'loginProviders.wecom.providerSecret',
      'loginProviders.wecom.paySecret',
      'loginProviders.github.secret',
      'loginProviders.google.secret',
      'loginProviders.microsoft.secret',
      'loginProviders.dingtalk.secret'
    ],
    { edition: 'pro', secret: true, applyMode: 'live' }
  ),
  ...createEntries(
    'security',
    [
      'useIpLimit',
      'checkInternalIp',
      'csrfEnabled',
      'passwordLoginMinuteLimitCount',
      'maxLoginSession',
      'allowedOrigins',
      'skipFileTypeCheck',
      'censor.baiduClientId',
      'censor.customCensorUrl',
      'workflowHttpNode.ignoreHttpsCertificate',
      'fileUrlWhitelist'
    ],
    { edition: 'all', secret: false, applyMode: 'live' }
  ),
  ...createEntries('security', ['censor.baiduClientSecret'], {
    edition: 'all',
    secret: true,
    applyMode: 'live'
  }),
  ...createEntries(
    'feature',
    [
      'hideChatCopyrightSetting',
      'multipleDataToBase64',
      'datasetSynonymEnabled',
      'agentEngine',
      'disableCache',
      'showEmptyChat',
      'enableTeamPluginUpload',
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
    { edition: 'all', secret: false, applyMode: 'live' }
  ),
  ...createEntries(
    'commercial',
    ['showCoupon', 'showDiscountCoupon', 'payFormUrl', 'agentSandboxFreeTip'],
    { edition: 'pro', secret: false, applyMode: 'live' }
  ),
  ...createEntries(
    'commercial',
    [
      'payment.wx.appId',
      'payment.wx.mchId',
      'payment.wx.serialNo',
      'payment.wx.notifyUrl',
      'payment.alipay.appId',
      'payment.alipay.gateway',
      'payment.alipay.endpoint',
      'payment.alipay.notifyUrl',
      'payment.bank.description',
      'billingNotify.paymentReceived.zh',
      'billingNotify.lackOfPoints.zh',
      'billingNotify.pointsTenPercentRemain.zh',
      'billingNotify.expireSoon.zh',
      'billingNotify.expired.zh'
    ],
    { edition: 'pro', secret: false, applyMode: 'live' }
  ),
  ...createEntries(
    'commercial',
    [
      'payment.wx.apiV3Key',
      'payment.wx.privateKey',
      'payment.alipay.appPrivateKey',
      'payment.alipay.appCertContent',
      'payment.alipay.rootCertContent',
      'payment.alipay.publicCertContent'
    ],
    { edition: 'pro', secret: true, applyMode: 'live' }
  ),
  ...createEntries(
    'resource',
    [
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
    { edition: 'all', secret: false, applyMode: 'reload' }
  ),
  ...createEntries(
    'performance',
    [
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
      'dataset.retrievalResultsLimit',
      'chat.maxQpm',
      'streamResume.ttlSeconds',
      'streamResume.postCompleteTtlSeconds',
      'streamResume.redisMaxmemoryRatio',
      'streamResume.redisMemoryCheckIntervalMs',
      'tracking.batchUpdateTime',
      'tracking.retentionHours',
      'task.evalConcurrency',
      'channel.wechatConcurrency'
    ],
    { edition: 'all', secret: false, applyMode: 'reload' }
  ),
  ...createEntries(
    'storage',
    ['downloadMode', 'externalEndpoint', 'cdnEndpoint', 'fileUrlExpiredDays'],
    {
      edition: 'all',
      secret: false,
      applyMode: 'reload'
    }
  ),
  ...createEntries('vector', ['hnswEfSearch', 'hnswMaxScanTuples'], {
    edition: 'all',
    secret: false,
    applyMode: 'reload'
  }),
  ...createEntries(
    'providers',
    [
      'documentParse.provider',
      'documentParse.customPdf.url',
      'documentParse.sangfor.url',
      'documentParse.sangfor.extensions',
      'documentParse.sangfor.timeoutSeconds',
      'dataSource.feishuBaseUrl',
      'dataSource.dingtalkBaseUrl',
      'dataSource.dingtalkOapiBaseUrl',
      'dataSource.yuqueDatasetBaseUrl',
      'externalProviderWorkflowVariables'
    ],
    { edition: 'all', secret: false, applyMode: 'reload' }
  ),
  ...createEntries(
    'subservice',
    [
      'plugin.enabled',
      'plugin.baseUrl',
      'plugin.remoteDebug',
      'plugin.remoteDebugUrl',
      'codeSandbox.enabled',
      'codeSandbox.baseUrl',
      'aiProxy.enabled',
      'aiProxy.endpoint',
      'mcp.enabled',
      'mcp.sseProxyUrl',
      'agentSandbox.provider',
      'agentSandbox.common.cpuCount',
      'agentSandbox.common.memoryMiB',
      'agentSandbox.common.storageSizeGi',
      'agentSandbox.common.suspendMinutes',
      'agentSandbox.common.archiveInactiveDays',
      'agentSandbox.common.maxEditDebug',
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
      'agentSandbox.opensandbox.volumeNamePrefix',
      'agentSandbox.proxy.wsUrl',
      'agentSandbox.proxy.httpUrl'
    ],
    { edition: 'pro', secret: false, applyMode: 'restart' }
  ),
  ...createEntries(
    'subservice',
    [
      'plugin.token',
      'codeSandbox.token',
      'aiProxy.token',
      'agentSandbox.sealosdevbox.token',
      'agentSandbox.opensandbox.apiKey',
      'agentSandbox.opensandbox.volumeManagerToken'
    ],
    { edition: 'pro', secret: true, applyMode: 'restart' }
  ),
  ...createEntries(
    'providers',
    [
      'documentParse.customPdf.key',
      'documentParse.customPdf.somarkApiKey',
      'documentParse.customPdf.doc2xKey',
      'documentParse.customPdf.textinAppId',
      'documentParse.customPdf.textinSecretCode',
      'documentParse.sangfor.key'
    ],
    { edition: 'all', secret: true, applyMode: 'reload' }
  )
];

/** 按开源版/商业版过滤 Admin 可见和可写的配置字段。 */
export const getSystemInstanceConfigRegistry = (
  edition: SystemInstanceConfigEdition
): SystemInstanceConfigRegistryItem[] =>
  edition === 'all'
    ? [...systemInstanceConfigRegistry]
    : systemInstanceConfigRegistry.filter(
        (item) => item.edition === 'all' || item.edition === edition
      );
