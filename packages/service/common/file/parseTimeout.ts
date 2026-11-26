import { PDF_PARSE_TIMEOUT_DEFAULT_SECONDS } from '@fastgpt/global/common/system/config/schemas/providers';
import { getSystemInstanceConfig } from '../system/systemInstanceConfig/runtime';

export const DEFAULT_FILE_PARSE_TIMEOUT_SECONDS = 600;

/**
 * 获取后端文件读取和解析使用的有效总 timeout（毫秒）。
 * 实例配置 performance.parse.fileTimeoutSeconds 是唯一运行时来源，最小 60 秒由 Schema 与表单限制。
 */
export const getBackendFileOperationTimeoutMs = () => {
  const configuredTimeoutSeconds =
    getSystemInstanceConfig().performance.parse.fileTimeoutSeconds ??
    DEFAULT_FILE_PARSE_TIMEOUT_SECONDS;

  return configuredTimeoutSeconds * 1000;
};

/**
 * 获取 PDF 增强解析（SoMark / Doc2X / TextIn / 自建服务）专用超时时间（毫秒）。
 * 与普通文件解析超时（performance.parse.fileTimeoutSeconds）独立，默认 600 秒，最小 60 秒由 Schema 与表单限制。
 */
export const getPdfEnhancedParseTimeoutMs = () => {
  const configuredTimeoutSeconds =
    getSystemInstanceConfig().providers.documentParse.customPdf?.timeoutSeconds ??
    PDF_PARSE_TIMEOUT_DEFAULT_SECONDS;

  return configuredTimeoutSeconds * 1000;
};
