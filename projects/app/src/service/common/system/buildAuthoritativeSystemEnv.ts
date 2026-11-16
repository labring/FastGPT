import type { SystemEnvType } from '@fastgpt/global/common/system/types';
import type { SystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { logInstanceConfigRead } from '@fastgpt/service/common/system/migrationCoverageLog';

/** 合成运行时 systemEnv：业务策略来自实例配置，部署能力来自独立 ENV scope 的内存投影。 */
export const buildAuthoritativeSystemEnv = ({
  baseSystemEnv,
  instanceConfig
}: {
  baseSystemEnv?: SystemEnvType;
  instanceConfig: SystemInstanceConfig;
}): SystemEnvType => {
  const systemEnv: SystemEnvType = {
    ...(baseSystemEnv || {}),
    openapiPrefix: instanceConfig.site.openApiPrefix,
    checkExternalFile: instanceConfig.security.checkExternalFile,
    fileUrlWhitelist: instanceConfig.security.fileUrlWhitelist,
    agentSandboxMax: instanceConfig.subservice.agentSandbox.common.maxEditDebug,
    // 保留 null：它是"明确不限量"，转成 undefined 会让 getAgentSandboxMaxPerTeam 回落 env。
    agentSandboxMaxPerTeam: instanceConfig.subservice.agentSandbox.common.maxPerTeam,
    workflowHttpNode: {
      ...(baseSystemEnv?.workflowHttpNode || {}),
      ignoreHttpsCertificate: instanceConfig.security.workflowHttpNode.ignoreHttpsCertificate
    },
    datasetParseMaxProcess: instanceConfig.performance.dataset.parseMaxProcess,
    vectorMaxProcess: instanceConfig.performance.dataset.vectorMaxProcess,
    qaMaxProcess: instanceConfig.performance.dataset.qaMaxProcess,
    vlmMaxProcess: instanceConfig.performance.dataset.vlmMaxProcess,
    hnswEfSearch: instanceConfig.vector.hnswEfSearch,
    vectorRecallConcurrency: instanceConfig.vector.vectorRecallConcurrency,
    customPdfParse: {
      // 旧库只保留 schema 外的扩展键；计费价格与解析凭据均以实例配置为权威。
      ...(baseSystemEnv?.customPdfParse || {}),
      url: instanceConfig.providers.documentParse.customPdf.url,
      key: instanceConfig.providers.documentParse.customPdf.key,
      somarkApiKey: instanceConfig.providers.documentParse.customPdf.somarkApiKey,
      doc2xKey: instanceConfig.providers.documentParse.customPdf.doc2xKey,
      textinAppId: instanceConfig.providers.documentParse.customPdf.textinAppId,
      textinSecretCode: instanceConfig.providers.documentParse.customPdf.textinSecretCode,
      price: instanceConfig.providers.documentParse.customPdf.price
    }
  };

  logInstanceConfigRead({
    callsite: 'startup.app.system.buildAuthoritativeSystemEnv',
    fields: [
      { path: 'site.openApiPrefix', value: instanceConfig.site.openApiPrefix },
      { path: 'security.checkExternalFile', value: instanceConfig.security.checkExternalFile },
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
      },
      {
        path: 'providers.documentParse.customPdf.price',
        value: instanceConfig.providers.documentParse.customPdf.price
      }
    ]
  });

  return systemEnv;
};
