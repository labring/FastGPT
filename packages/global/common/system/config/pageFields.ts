import type { SystemInstanceConfigEdition } from './registry';
import { isConfigFieldVisible } from './permission';

/**
 * 每个后台配置页面所管理的实例配置字段集合。
 * 用于按「版本（社区版/商业版）」和「ENABLE_SAAS_ADMIN_CONFIG」动态计算页面可见性：
 * 当页面内所有字段在当前环境下均不可见时，该页面的菜单项自动隐藏。
 */
export const adminConfigPageFieldsMap: Record<string, readonly string[]> = {
  '/admin/settings/core': [
    'auth.defaultTeamBasicPermissionsEnabled',
    'auth.teamMode',
    'auth.loginProviders.email.smtp',
    'auth.loginProviders.phone.signName',
    'feature.agentEngine',
    'feature.multipleDataToBase64',
    'storage.downloadMode',
    'site.customApiDomain',
    'site.customSharePageDomain',
    'site.scripts'
  ],
  '/admin/settings/site': [
    'site.name',
    'site.description',
    'site.favicon',
    'site.marketplaceUrl',
    'site.docUrl',
    'site.openApiDocUrl',
    'site.openApiPrefix',
    'site.concatMd',
    'site.appTemplateCourse',
    'site.loginGuideDocUrl',
    'site.navbarItems'
  ],
  '/admin/settings/feature': [
    'feature.hideChatCopyrightSetting',
    'feature.enableTeamPluginUpload',
    'feature.showDatasetFeishu',
    'feature.showDatasetYuque',
    'feature.showDatasetDingtalk',
    'feature.showPublishFeishu',
    'feature.showPublishDingtalk',
    'feature.showPublishWecom',
    'feature.showPublishOffiaccount',
    'feature.showPublishWechat',
    'feature.showComplianceCopywriting'
  ],
  '/admin/settings/auth': [
    'auth.loginProviders.email.register',
    'auth.passwordExpiredMonth',
    'auth.wecomLoginAutoRedirect',
    'auth.loginProviders.sms.login.zh',
    'auth.loginProviders.phone.accessKeyId',
    'auth.loginProviders.wechat.appId',
    'auth.loginProviders.wecom.suiteId',
    'auth.loginProviders.wecom.corpId',
    'auth.loginProviders.wecom.buyerUserId',
    'auth.loginProviders.github.clientId',
    'auth.loginProviders.google.clientId',
    'auth.loginProviders.microsoft.clientId',
    'auth.loginProviders.dingtalk.clientId',
    'auth.accountCancellation.enabled',
    'security.passwordLoginMinuteLimitCount',
    'security.maxLoginSession'
  ],
  '/admin/settings/security': [
    'security.useIpLimit',
    'security.checkInternalIp',
    'security.csrfEnabled',
    'security.allowedOrigins',
    'security.fileUrlWhitelist',
    'security.skipFileTypeCheck',
    'security.censor.baiduClientId',
    'security.workflowHttpNode.ignoreHttpsCertificate'
  ],
  '/admin/settings/limits': [
    'auth.openApiKeyMaxCount',
    'resource.serviceRequestMaxContentLength',
    'resource.systemMaxStringLengthM',
    'resource.maxFolderDepth',
    'resource.appFolderMaxAmount',
    'resource.datasetFolderMaxAmount',
    'resource.uploadFileMaxSize',
    'resource.uploadFileMaxAmount',
    'resource.datasetArchive.maxFiles',
    'resource.datasetArchive.maxSourceSizeMiB',
    'resource.datasetArchive.maxConcurrency',
    'resource.datasetArchive.prepareTimeoutSeconds',
    'resource.exportDatasetLimitMinutes',
    'resource.websiteSyncLimitMinuted',
    'performance.workflow.maxRunTimes',
    'performance.workflow.maxLoopTimes',
    'performance.workflow.parallelMaxConcurrency',
    'performance.parse.fileTimeoutSeconds',
    'performance.parse.xlsxMaxRows',
    'performance.parse.maxHtmlTransformChars',
    'performance.dataset.parseMaxProcess',
    'performance.dataset.retrievalResultsLimit',
    'performance.chat.maxQpm',
    'performance.streamResume.ttlSeconds',
    'performance.tracking.batchUpdateTime',
    'performance.task.evalConcurrency',
    'performance.channel.wechatConcurrency',
    'vector.hnswEfSearch',
    'vector.vectorRecallConcurrency'
  ],
  '/admin/settings/providers': [
    'providers.documentParse.provider',
    'providers.documentParse.customPdf.url',
    'providers.documentParse.sangfor.url',
    'providers.dataSource.feishuBaseUrl',
    'providers.dataSource.dingtalkBaseUrl',
    'providers.dataSource.yuqueDatasetBaseUrl',
    'providers.externalProviderWorkflowVariables'
  ],
  '/admin/settings/pay': [
    'commercial.showCoupon',
    'commercial.showDiscountCoupon',
    'commercial.payFormUrl',
    'commercial.payment.wx.appId',
    'commercial.payment.alipay.appId',
    'commercial.payment.bank.description',
    'commercial.billingNotify.paymentReceived.zh'
  ],
  '/admin/subservice/plugin': [
    'subservice.plugin.baseUrl',
    'subservice.plugin.remoteDebug',
    'subservice.plugin.remoteDebugUrl'
  ],
  '/admin/subservice/code-sandbox': [
    'subservice.codeSandbox.enabled',
    'subservice.codeSandbox.baseUrl'
  ],
  '/admin/subservice/ai-proxy': ['subservice.aiProxy.enabled', 'subservice.aiProxy.endpoint'],
  '/admin/subservice/agent-sandbox': [
    'subservice.agentSandbox.provider',
    'subservice.agentSandbox.common.cpuCount',
    'subservice.agentSandbox.common.memoryMiB',
    'subservice.agentSandbox.common.storageSizeGi',
    'subservice.agentSandbox.sealosdevbox.baseUrl',
    'subservice.agentSandbox.opensandbox.baseUrl'
  ]
};

/**
 * 统计指定配置页面在给定版本与显示开关下的可见字段数量。
 */
export const countPageVisibleFields = (
  route: string,
  options: {
    edition: SystemInstanceConfigEdition;
    enableSaasAdminConfig?: boolean;
  }
): number => {
  const fields = adminConfigPageFieldsMap[route];
  if (!fields) return 0;
  return fields.filter((key) => isConfigFieldVisible(key, options)).length;
};
