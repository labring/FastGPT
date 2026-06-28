/**
 * 沙盒接口层：暴露 Agent sandbox 对外可用的配置派生值。
 *
 * env.ts 只负责解析原始环境变量；这里承接 sandbox 领域内的大小限制换算，
 * 避免业务调用方散落重复的 MB/bytes 计算。
 */
import { serviceEnv } from '../../../../env';

const MB_BYTES = 1024 * 1024;
const toRoundedMBBytes = (mb: number) => Math.round(mb) * MB_BYTES;

/** 获取 Agent sandbox 磁盘基准字节数，按 MB 四舍五入。 */
export const getAgentSandboxDiskBytes = () => toRoundedMBBytes(serviceEnv.AGENT_SANDBOX_DISK_MB);

/** 获取 sandbox 冷归档包大小上限，等于磁盘基准。 */
export const getAgentSandboxArchiveMaxBytes = getAgentSandboxDiskBytes;

/** 获取 Skill 包大小上限，按磁盘基准的一半四舍五入。 */
export const getAgentSandboxSkillMaxBytes = () =>
  toRoundedMBBytes(serviceEnv.AGENT_SANDBOX_DISK_MB * 0.5);

/** 获取 IDE 单文件大小上限，复用 Skill 包大小上限。 */
export const getAgentSandboxMaxFileBytes = getAgentSandboxSkillMaxBytes;
