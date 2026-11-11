/**
 * 沙盒原子层：读取 volume-manager 连接配置。
 *
 * 只做实例配置校验和配置返回，不发起 volume 或 sandbox 操作。
 */
import { getAgentSandboxCommonConfig, getAgentSandboxOpenSandboxConfig } from '../../config';

export type VolumeManagerConfig = {
  url: string;
  token?: string;
  volumeNamePrefix: string;
  storageSize: string;
};

/**
 * 读取 volume-manager 配置。
 *
 * 连接信息以实例配置 subservice.agentSandbox 为权威；
 * volume-manager 只负责分配持久卷，OpenSandbox 的挂载路径由运行态固定为 /workspace。
 */
export function getVolumeManagerEnvConfig(): VolumeManagerConfig {
  const opensandbox = getAgentSandboxOpenSandboxConfig();
  const { storageSizeGi } = getAgentSandboxCommonConfig();
  if (!opensandbox.volumeManagerUrl) {
    throw new Error('Configure the volume manager URL in Agent Sandbox admin settings');
  }

  return {
    url: opensandbox.volumeManagerUrl,
    token: opensandbox.volumeManagerToken,
    volumeNamePrefix: opensandbox.volumeNamePrefix,
    storageSize: `${storageSizeGi}Gi`
  };
}
