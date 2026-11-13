/**
 * Sandbox 领域共享配置派生。
 *
 * 这里只派生已在入口校验的系统配置和环境配置，不依赖 interface、application
 * 或 infrastructure，供各层单向引用。
 */
import { MB_BYTES, RESERVED_DISK_MB } from './constants';
import { serviceEnv } from '../../../env';
import {
  resolveAgentSandboxPreviewProxyBaseUrl,
  resolveAgentSandboxTerminalProxyUrl
} from '../../../env.util';

/** 获取 Agent sandbox 磁盘基准字节数，按存储容量换算并预留 150MB（JuiceFS 随写随落 S3，无需 2x 归档预留）。 */
export const getAgentSandboxDiskBytes = () => {
  const storageMB = serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI * 1024;
  const diskMB = Math.round(storageMB - RESERVED_DISK_MB);
  if (diskMB <= 0) {
    throw new Error(`AGENT_SANDBOX_STORAGE_SIZE_GI must be greater than ${RESERVED_DISK_MB}MiB`);
  }
  return diskMB * MB_BYTES;
};

/** 获取运行中 sandbox 自动暂停前允许的未活跃分钟数。 */
export const getAgentSandboxSuspendMinutes = () => serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES;

/** 获取 Skill 包大小上限，等于磁盘基准。 */
export const getAgentSandboxSkillMaxBytes = getAgentSandboxDiskBytes;

/** 获取 IDE 单文件大小上限，等于磁盘基准。 */
export const getAgentSandboxMaxFileBytes = getAgentSandboxDiskBytes;

/**
 * 获取 Agent sandbox 活跃实例系统总上限（app 会话与技能编辑共用同一计数池）。
 * 服务端系统配置（管理台 systemEnv）优先，env 兜底；undefined 表示不限制。
 */
export const getAgentSandboxMax = (): number | undefined =>
  global.systemEnv?.agentSandboxMax ?? serviceEnv.AGENT_SANDBOX_MAX;

/**
 * 获取单团队 Agent sandbox 活跃实例配额；系统配置优先、env 兜底，undefined 表示不限制。
 */
export const getAgentSandboxMaxPerTeam = (): number | undefined =>
  global.systemEnv?.agentSandboxMaxPerTeam ?? serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM;

/** 获取面向浏览器的 opensandbox-proxy `/terminal` WebSocket 地址。 */
export const getAgentSandboxTerminalProxyUrl = (): string =>
  resolveAgentSandboxTerminalProxyUrl(serviceEnv.AGENT_SANDBOX_PROXY_URL);

/** 获取面向浏览器的 opensandbox-proxy 静态文件预览 HTTP 基地址（优先使用显式覆盖，默认回退主地址）。 */
export const getAgentSandboxPreviewProxyBaseUrl = (): string =>
  resolveAgentSandboxPreviewProxyBaseUrl({
    previewProxyUrl: serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL,
    proxyUrl: serviceEnv.AGENT_SANDBOX_PROXY_URL
  });
