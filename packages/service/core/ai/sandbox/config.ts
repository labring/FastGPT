/**
 * Sandbox 领域共享配置派生。
 *
 * 这里只派生已在入口校验的系统配置，不依赖 interface、application
 * 或 infrastructure，供各层单向引用。
 *
 * 所有字段以实例配置快照为唯一运行时来源；ENV 只在启动迁移时一次性 seed 进 DB。
 */
import { MB_BYTES } from './constants';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/runtime';

type AgentSandboxInstanceConfig = ReturnType<
  typeof getSystemInstanceConfig
>['subservice']['agentSandbox'];

/** 实例配置中的 Agent Sandbox 域；运行期以该快照为唯一权威。 */
const getInstanceAgentSandboxConfig = (): AgentSandboxInstanceConfig =>
  getSystemInstanceConfig().subservice.agentSandbox;

/** 当前实例配置是否已启用 Agent Sandbox。 */
export const isAgentSandboxEnabled = (): boolean => getInstanceAgentSandboxConfig().enabled;

/** 票据签发、Proxy 反向鉴权和文件预览统一读取同一份实例代理配置。 */
export const getAgentSandboxProxyConfig = () => getInstanceAgentSandboxConfig().proxy;

/** 实例配置的公共资源与生命周期参数。 */
export const getAgentSandboxCommonConfig = () => getInstanceAgentSandboxConfig().common;

/** OpenSandbox 连接配置。 */
export const getAgentSandboxOpenSandboxConfig = () => getInstanceAgentSandboxConfig().opensandbox;

/** 判断当前实例配置是否已启用 Agent Sandbox 且 OpenSandbox 控制面连接信息完整。 */
export const isAgentSandboxOpenSandboxConfigured = (): boolean => {
  if (!isAgentSandboxEnabled()) return false;
  const { baseUrl, apiKey } = getAgentSandboxOpenSandboxConfig();
  return Boolean(baseUrl && apiKey);
};

/** 获取 Agent sandbox 磁盘基准字节数，直接按 PVC 存储容量换算（归档、恢复与 Skill 注入均流式传输，容器 `/tmp` 零暂存）。 */
export const getAgentSandboxDiskBytes = () =>
  Math.round(getAgentSandboxCommonConfig().storageSizeGi * 1024 * MB_BYTES);
