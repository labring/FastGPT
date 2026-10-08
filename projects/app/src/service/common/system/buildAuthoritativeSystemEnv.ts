import type { SystemEnvType } from '@fastgpt/global/common/system/types';
import type { SystemInstanceConfig } from '@fastgpt/global/common/system/config';

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
}): SystemEnvType => ({
  ...(legacySystemEnv || {}),
  datasetParseMaxProcess: instanceConfig.performance.dataset.parseMaxProcess,
  vectorMaxProcess: instanceConfig.performance.dataset.vectorMaxProcess,
  qaMaxProcess: instanceConfig.performance.dataset.qaMaxProcess,
  vlmMaxProcess: instanceConfig.performance.dataset.vlmMaxProcess,
  hnswEfSearch: instanceConfig.vector.hnswEfSearch,
  hnswMaxScanTuples: instanceConfig.vector.hnswMaxScanTuples,
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
});
