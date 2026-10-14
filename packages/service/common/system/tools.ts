import {
  FastGPTConfigFileSchema,
  SystemEnvSchema,
  type FastGPTConfigFileType
} from '@fastgpt/global/common/system/types';
import { isIPv6 } from 'net';
import { getLogger, LogCategories } from '../logger';
import { getAgentSandboxSkillMaxBytes } from '../../core/ai/sandbox/config';
import { hasAgentSandboxConfig, serviceEnv } from '../../env';

const logger = getLogger(LogCategories.ERROR);

export const SERVICE_LOCAL_PORT = `${process.env.PORT || 3000}`;
export const SERVICE_LOCAL_HOST =
  process.env.HOSTNAME && isIPv6(process.env.HOSTNAME)
    ? `[${process.env.HOSTNAME}]:${SERVICE_LOCAL_PORT}`
    : `${process.env.HOSTNAME || 'localhost'}:${SERVICE_LOCAL_PORT}`;

/**
 * 校验并加载文件、数据库或热更新配置到全局状态。
 * 沙箱配额必须在加载时校验，读取端只负责优先级；其他历史配置保留校验失败时的兼容行为。
 */
export const initFastGPTConfig = (config?: FastGPTConfigFileType) => {
  if (!config?.feConfigs || !config?.systemEnv) return;

  // 配额校验先于任何状态修改，避免整体配置降级时把非法配额带入运行时。
  const sandboxQuotas = SystemEnvSchema.pick({
    agentSandboxMax: true,
    agentSandboxMaxPerTeam: true
  })
    .strip()
    .parse(config.systemEnv);

  // 兼容旧版后端策略配置；显式 systemEnv（包括空白名单）始终优先。
  config.systemEnv.fileUrlWhitelist ??= Array.isArray(config.feConfigs.fileUrlWhitelist)
    ? config.feConfigs.fileUrlWhitelist
    : undefined;
  config.systemEnv.ip_whitelist ??=
    typeof config.feConfigs.ip_whitelist === 'string' ? config.feConfigs.ip_whitelist : undefined;
  delete config.feConfigs.fileUrlWhitelist;
  delete config.feConfigs.ip_whitelist;
  delete config.feConfigs.evalFileMaxLines;
  delete config.feConfigs.uploadFileMaxSize;
  delete config.feConfigs.uploadFileMaxAmount;

  // 旧文件/数据库配置可能仍包含已迁移到 getTicket 的字段，不再进入全局前端配置。
  delete config.feConfigs.agentSandboxProxyUrl;
  if (config.feConfigs.limit) {
    delete config.feConfigs.limit.agentSandboxMaxFileBytes;
    delete config.feConfigs.limit.agentSandboxArchiveMaxBytes;
    delete config.feConfigs.limit.agentSandboxMaxSessionRuntime;
  }

  // Special config computed
  config.feConfigs.showCustomPdfParse =
    !!config.systemEnv.customPdfParse?.url ||
    !!config.systemEnv.customPdfParse?.somarkApiKey ||
    !!config.systemEnv.customPdfParse?.textinAppId ||
    !!config.systemEnv.customPdfParse?.doc2xKey;
  config.feConfigs.customPdfParsePrice = config.systemEnv.customPdfParse?.price || 0;
  config.feConfigs.show_agent_sandbox = hasAgentSandboxConfig();
  config.feConfigs.show_agent_sandbox_free_tip =
    serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP || !!config.feConfigs.agentSandboxFree;
  config.feConfigs.limit = {
    ...config.feConfigs.limit,
    uploadFileMaxSize: serviceEnv.UPLOAD_FILE_MAX_SIZE,
    uploadFileMaxAmount: serviceEnv.UPLOAD_FILE_MAX_AMOUNT,
    skillSandboxMaxBytes: getAgentSandboxSkillMaxBytes(),
    maxFolderDepth: serviceEnv.MAX_FOLDER_DEPTH
  };

  const parseResult = FastGPTConfigFileSchema.safeParse(config);
  if (!parseResult.success) {
    logger.error('FastGPT system config validation failed', {
      error: parseResult.error
    });
  }

  const safeConfig = parseResult.success ? parseResult.data : config;

  global.feConfigs = safeConfig.feConfigs || config.feConfigs;
  global.systemEnv = { ...(safeConfig.systemEnv ?? config.systemEnv), ...sandboxQuotas };
  global.subPlans = safeConfig.subPlans ?? config.subPlans;
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
