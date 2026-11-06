import {
  FastGPTConfigFileSchema,
  SystemEnvSchema,
  type FastGPTConfigFileType
} from '@fastgpt/global/common/system/types';
import { isIPv6 } from 'net';
import { getLogger, LogCategories } from '../logger';
import {
  getAgentSandboxProvider,
  getAgentSandboxSkillMaxBytes
} from '../../core/ai/sandbox/config';
import { serviceEnv } from '../../env';
import { normalizeSsoConfig } from '@fastgpt/global/common/system/config/sso';

const logger = getLogger(LogCategories.ERROR);

export const SERVICE_LOCAL_PORT = `${process.env.PORT || 3000}`;
export const SERVICE_LOCAL_HOST =
  process.env.HOSTNAME && isIPv6(process.env.HOSTNAME)
    ? `[${process.env.HOSTNAME}]:${SERVICE_LOCAL_PORT}`
    : `${process.env.HOSTNAME || 'localhost'}:${SERVICE_LOCAL_PORT}`;

/**
 * 校验并加载文件、数据库或热更新配置到全局状态。
 * 配额和向量检索并发必须在加载时校验；其他历史配置保留校验失败时的兼容行为。
 */
export const initFastGPTConfig = (config?: FastGPTConfigFileType) => {
  if (!config?.feConfigs || !config?.systemEnv) return;

  // 配额校验先于任何状态修改，避免整体配置降级时把非法配额带入运行时。
  const runtimeLimits = SystemEnvSchema.pick({
    agentSandboxMax: true,
    agentSandboxMaxPerTeam: true,
    vectorRecallConcurrency: true
  })
    .strip()
    .parse(config.systemEnv);

  // 旧地址只在加载边界迁入服务端配置；校验降级时也不能重新挂回 feConfigs。
  const sso = normalizeSsoConfig({
    publicConfig: config.feConfigs.sso,
    serverConfig: config.systemEnv.sso
  });
  config.feConfigs.sso = sso.publicConfig;
  config.systemEnv.sso = sso.serverConfig;

  // Special config computed
  config.feConfigs.showCustomPdfParse =
    !!config.systemEnv.customPdfParse?.url ||
    !!config.systemEnv.customPdfParse?.somarkApiKey ||
    !!config.systemEnv.customPdfParse?.textinAppId ||
    !!config.systemEnv.customPdfParse?.doc2xKey;
  config.feConfigs.customPdfParsePrice = config.systemEnv.customPdfParse?.price || 0;
  config.feConfigs.show_outlink_brand = serviceEnv.SHOW_OUTLINK_BRAND;
  // provider 只以实例配置为权威，保证后台配置与前端沙箱入口一致。
  config.feConfigs.show_agent_sandbox = getAgentSandboxProvider() !== 'none';
  // 免费提示只由保留的 ENV 控制，避免旧配置在开关关闭后继续展示。
  config.feConfigs.show_agent_sandbox_free_tip = serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP;
  config.feConfigs.limit = {
    ...config.feConfigs.limit,
    uploadFileMaxSize: config.feConfigs.limit?.uploadFileMaxSize ?? 1000,
    uploadFileMaxAmount: config.feConfigs.limit?.uploadFileMaxAmount ?? 1000,
    skillSandboxMaxBytes: getAgentSandboxSkillMaxBytes(),
    maxFolderDepth: config.feConfigs.limit?.maxFolderDepth ?? 4
  };

  const parseResult = FastGPTConfigFileSchema.safeParse(config);
  if (!parseResult.success) {
    logger.error('FastGPT system config validation failed', {
      error: parseResult.error
    });
  }

  const safeConfig = parseResult.success ? parseResult.data : config;

  global.feConfigs = safeConfig.feConfigs || config.feConfigs;
  global.systemEnv = { ...(safeConfig.systemEnv ?? config.systemEnv), ...runtimeLimits };
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
