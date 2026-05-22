import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/skill/type';
import { serviceEnv } from '../../../../env';

export type SandboxDefaults = {
  defaultImage: SandboxImageConfigType;
  workDirectory: string;
  entrypoint: string;
};

/**
 * 获取通用 sandbox 默认配置。
 *
 * 这里只描述 sandbox 自身的镜像、工作目录和入口脚本，不承载 skill 运行时语义。
 */
export function getSandboxDefaults(): SandboxDefaults {
  if (serviceEnv.AGENT_SANDBOX_PROVIDER === 'sealosdevbox') {
    return {
      defaultImage: {
        repository: ''
      },
      workDirectory: '/home/devbox/workspace',
      entrypoint: ''
    };
  }

  return {
    defaultImage: {
      repository: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
      tag: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG
    },
    workDirectory: serviceEnv.AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH,
    entrypoint: '/home/sandbox/entrypoint.sh'
  };
}
