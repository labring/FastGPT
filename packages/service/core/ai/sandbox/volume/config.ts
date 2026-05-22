import { serviceEnv } from '../../../../env';

export type VolumeManagerConfig = {
  enable: boolean;
  url: string;
  token?: string;
  mountPath: string;
};

/**
 * 读取 volume-manager 的环境配置。
 *
 * volume 目录自己拥有配置读取逻辑，调用方不需要知道 env key 的命名规则。
 */
export function getVolumeManagerEnvConfig(): VolumeManagerConfig {
  return {
    enable: serviceEnv.AGENT_SANDBOX_ENABLE_VOLUME,
    url: serviceEnv.AGENT_SANDBOX_VOLUME_MANAGER_URL!,
    token: serviceEnv.AGENT_SANDBOX_VOLUME_MANAGER_TOKEN,
    mountPath: serviceEnv.AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH
  };
}
