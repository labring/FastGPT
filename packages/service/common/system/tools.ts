import { type FastGPTConfigFileType } from '@fastgpt/global/common/system/types';
import { isIPv6 } from 'net';

export const SERVICE_LOCAL_PORT = `${process.env.PORT || 3000}`;
export const SERVICE_LOCAL_HOST =
  process.env.HOSTNAME && isIPv6(process.env.HOSTNAME)
    ? `[${process.env.HOSTNAME}]:${SERVICE_LOCAL_PORT}`
    : `${process.env.HOSTNAME || 'localhost'}:${SERVICE_LOCAL_PORT}`;

export const initFastGPTConfig = (config?: FastGPTConfigFileType) => {
  if (!config) return;

  // Special config computed
  const parsers = config.systemEnv.customPdfParse || [];
  config.feConfigs.showCustomPdfParse = parsers.length > 0;

  global.feConfigs = config.feConfigs;
  global.systemEnv = config.systemEnv;
  global.subPlans = config.subPlans;
};

export const systemStartCb = () => {
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // process.exit(1); // 退出进程
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // process.exit(1); // 退出进程
  });
};

export const surrenderProcess = () => new Promise((resolve) => setImmediate(resolve));
