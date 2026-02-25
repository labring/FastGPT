import { type FastGPTConfigFileType } from '@fastgpt/global/common/system/types';
import { isIPv6 } from 'net';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.ERROR);

export const SERVICE_LOCAL_PORT = `${process.env.PORT || 3000}`;
export const SERVICE_LOCAL_HOST =
  process.env.HOSTNAME && isIPv6(process.env.HOSTNAME)
    ? `[${process.env.HOSTNAME}]:${SERVICE_LOCAL_PORT}`
    : `${process.env.HOSTNAME || 'localhost'}:${SERVICE_LOCAL_PORT}`;

export const initFastGPTConfig = (config?: FastGPTConfigFileType) => {
  if (!config) return;

  // Special config computed
  config.feConfigs.showCustomPdfParse =
    !!config.systemEnv.customPdfParse?.url ||
    !!config.systemEnv.customPdfParse?.textinAppId ||
    !!config.systemEnv.customPdfParse?.doc2xKey;
  config.feConfigs.customPdfParsePrice = config.systemEnv.customPdfParse?.price || 0;
  config.feConfigs.uploadFileMaxSize = Number(process.env.UPLOAD_FILE_MAX_SIZE || 1000);
  config.feConfigs.uploadFileMaxAmount = Number(process.env.UPLOAD_FILE_MAX_AMOUNT || 1000);

  global.feConfigs = config.feConfigs;
  global.systemEnv = config.systemEnv;
  global.subPlans = config.subPlans;
};

export const systemStartCb = () => {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err });
    // process.exit(1); // 退出进程
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason, promise });
    // process.exit(1); // 退出进程
  });
};

export const surrenderProcess = () => new Promise((resolve) => setImmediate(resolve));
