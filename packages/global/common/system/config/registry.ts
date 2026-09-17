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
      'chineseRedirectUrl',
      'marketplaceUrl',
      'docUrl',
      'openApiDocUrl',
      'systemTitle'
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
  ...createEntries(
    'security',
    [
      'useIpLimit',
      'checkInternalIp',
      'csrfEnabled',
      'passwordLoginMinuteLimitCount',
      'maxLoginSession',
      'allowedOrigins',
      'skipFileTypeCheck'
    ],
    { edition: 'all', secret: false, applyMode: 'live' }
  ),
  ...createEntries(
    'feature',
    [
      'hideChatCopyrightSetting',
      'multipleDataToBase64',
      'datasetSynonymEnabled',
      'agentEngine',
      'disableCache',
      'showEmptyChat',
      'showGit',
      'enableTeamPluginUpload'
    ],
    { edition: 'all', secret: false, applyMode: 'live' }
  ),
  ...createEntries(
    'commercial',
    ['showCoupon', 'showDiscountCoupon', 'payFormUrl', 'agentSandboxFreeTip'],
    { edition: 'pro', secret: false, applyMode: 'live' }
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
      'systemMaxStringLengthM'
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
      'chat.maxQpm',
      'chat.logUrl',
      'chat.logInterval',
      'chat.logSourceIdPrefix',
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
    ['downloadMode', 'downloadRedirectTtlSeconds', 'fileUrlExpiredDays'],
    { edition: 'all', secret: false, applyMode: 'reload' }
  ),
  ...createEntries(
    'vector',
    ['vqLevel', 'languageIdentifier', 'hnswEfSearch', 'hnswMaxScanTuples'],
    { edition: 'all', secret: false, applyMode: 'reload' }
  ),
  ...createEntries(
    'providers',
    [
      'documentParse.provider',
      'documentParse.customPdf.url',
      'documentParse.sangfor.url',
      'documentParse.sangfor.extensions',
      'documentParse.sangfor.timeoutSeconds',
      'chunk.enabled',
      'chunk.url',
      'chunk.timeoutMinutes',
      'crm.enabled',
      'crm.apiUrl',
      'dataSource.feishuBaseUrl',
      'dataSource.dingtalkBaseUrl',
      'dataSource.dingtalkOapiBaseUrl',
      'dataSource.yuqueDatasetBaseUrl'
    ],
    { edition: 'all', secret: false, applyMode: 'reload' }
  ),
  ...createEntries(
    'subservice',
    [
      'plugin.enabled',
      'plugin.baseUrl',
      'codeSandbox.enabled',
      'codeSandbox.baseUrl',
      'aiProxy.enabled',
      'aiProxy.endpoint',
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
      'agentSandbox.opensandbox.volumeNamePrefix'
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
      'documentParse.sangfor.key',
      'chunk.key',
      'crm.apiKey'
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
