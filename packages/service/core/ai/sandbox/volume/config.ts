import { serviceEnv } from '../../../../env';

export type VolumeManagerConfig = {
  enable: boolean;
  url: string;
  token?: string;
};

/**
 * 读取 volume-manager 的环境配置。
 *
 * volume-manager 只负责分配持久卷，OpenSandbox 的挂载路径由运行态固定为 /workspace。
 */
export function getVolumeManagerEnvConfig(): VolumeManagerConfig {
  return {
    enable: serviceEnv.AGENT_SANDBOX_ENABLE_VOLUME,
    url: serviceEnv.AGENT_SANDBOX_VOLUME_MANAGER_URL!,
    token: serviceEnv.AGENT_SANDBOX_VOLUME_MANAGER_TOKEN
  };
}
