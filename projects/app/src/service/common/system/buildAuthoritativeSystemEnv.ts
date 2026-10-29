import type { SystemEnvType } from '@fastgpt/global/common/system/types';
import type { SystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { logInstanceConfigRead } from '@fastgpt/service/common/system/migrationCoverageLog';

/**
 * 合成运行时 systemEnv：实例配置（SystemInstanceConfig）为权威数据源，
 * 旧库 systemEnv 仅提供 schema 之外的扩展键（如 langfuse、customPdfParse.price）。
 *
 * 设计原因：
 * - 旧实现用 Object.assign 把旧库 systemEnv 排在最后，会覆盖刚从实例配置读取的值，
 *   导致管理员通过新 Admin 页面修改这 7 个字段后被旧库值静默回退。
 * - customPdfParse 需要深合并：price 等计费字段不在实例配置 schema 内，只能来自旧库。
 */
export const buildAuthoritativeSystemEnv = ({
  legacySystemEnv,
  instanceConfig
}: {
  legacySystemEnv?: SystemEnvType;
  instanceConfig: SystemInstanceConfig;
}): SystemEnvType => {
  const systemEnv: SystemEnvType = {
    ...(legacySystemEnv || {}),
    openapiPrefix: instanceConfig.site.openApiPrefix,
    fileUrlWhitelist: instanceConfig.security.fileUrlWhitelist,
    agentSandboxMax: instanceConfig.subservice.agentSandbox.common.maxEditDebug,
    agentSandboxMaxPerTeam: instanceConfig.subservice.agentSandbox.common.maxPerTeam ?? undefined,
    workflowHttpNode: {
      ...(legacySystemEnv?.workflowHttpNode || {}),
      ignoreHttpsCertificate: instanceConfig.security.workflowHttpNode.ignoreHttpsCertificate
    },
    datasetParseMaxProcess: instanceConfig.performance.dataset.parseMaxProcess,
    vectorMaxProcess: instanceConfig.performance.dataset.vectorMaxProcess,
    qaMaxProcess: instanceConfig.performance.dataset.qaMaxProcess,
    vlmMaxProcess: instanceConfig.performance.dataset.vlmMaxProcess,
    hnswEfSearch: instanceConfig.vector.hnswEfSearch,
    hnswMaxScanTuples: instanceConfig.vector.hnswMaxScanTuples,
    vectorRecallConcurrency: instanceConfig.vector.vectorRecallConcurrency,
    customPdfParse: {
      // 旧库独有的计费/扩展字段（price 等）深合并保留
      ...(legacySystemEnv?.customPdfParse || {}),
      url: instanceConfig.providers.documentParse.customPdf.url,
      key: instanceConfig.providers.documentParse.customPdf.key,
      somarkApiKey: instanceConfig.providers.documentParse.customPdf.somarkApiKey,
      doc2xKey: instanceConfig.providers.documentParse.customPdf.doc2xKey,
      textinAppId: instanceConfig.providers.documentParse.customPdf.textinAppId,
      textinSecretCode: instanceConfig.providers.documentParse.customPdf.textinSecretCode
    }
  };

  logInstanceConfigRead({
    callsite: 'startup.app.system.buildAuthoritativeSystemEnv',
    fields: [
      { path: 'site.openApiPrefix', value: instanceConfig.site.openApiPrefix },
      { path: 'security.fileUrlWhitelist', value: instanceConfig.security.fileUrlWhitelist },
      {
        path: 'subservice.agentSandbox.common.maxEditDebug',
        value: instanceConfig.subservice.agentSandbox.common.maxEditDebug
      },
      {
        path: 'security.workflowHttpNode.ignoreHttpsCertificate',
        value: instanceConfig.security.workflowHttpNode.ignoreHttpsCertificate
      },
      {
        path: 'performance.dataset.parseMaxProcess',
        value: instanceConfig.performance.dataset.parseMaxProcess
      },
      {
        path: 'performance.dataset.vectorMaxProcess',
        value: instanceConfig.performance.dataset.vectorMaxProcess
      },
      {
        path: 'performance.dataset.qaMaxProcess',
        value: instanceConfig.performance.dataset.qaMaxProcess
      },
      {
        path: 'performance.dataset.vlmMaxProcess',
        value: instanceConfig.performance.dataset.vlmMaxProcess
      },
      { path: 'vector.hnswEfSearch', value: instanceConfig.vector.hnswEfSearch },
      { path: 'vector.hnswMaxScanTuples', value: instanceConfig.vector.hnswMaxScanTuples },
      {
        path: 'vector.vectorRecallConcurrency',
        value: instanceConfig.vector.vectorRecallConcurrency
      },
      {
        path: 'providers.documentParse.customPdf.url',
        value: instanceConfig.providers.documentParse.customPdf.url
      },
      {
        path: 'providers.documentParse.customPdf.key',
        value: instanceConfig.providers.documentParse.customPdf.key
      },
      {
        path: 'providers.documentParse.customPdf.somarkApiKey',
        value: instanceConfig.providers.documentParse.customPdf.somarkApiKey
      },
      {
        path: 'providers.documentParse.customPdf.doc2xKey',
        value: instanceConfig.providers.documentParse.customPdf.doc2xKey
      },
      {
        path: 'providers.documentParse.customPdf.textinAppId',
        value: instanceConfig.providers.documentParse.customPdf.textinAppId
      },
      {
        path: 'providers.documentParse.customPdf.textinSecretCode',
        value: instanceConfig.providers.documentParse.customPdf.textinSecretCode
      }
    ]
  });

  return systemEnv;
};
