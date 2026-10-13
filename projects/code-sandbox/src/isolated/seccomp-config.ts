import { env } from '../env';

/**
 * 返回 JS 与 Python 共用的 seccomp 配置。
 *
 * seccomp 默认开启，只有部署者通过环境变量明确禁用时才关闭。native chroot、
 * no_new_privs 和 UID/GID 降权不受该配置影响。
 */
export function getSeccompConfig() {
  return {
    enableSeccomp: !env.SANDBOX_DISABLE_SECCOMP
  };
}
