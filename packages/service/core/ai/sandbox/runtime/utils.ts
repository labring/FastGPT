import { createHash } from 'crypto';

type HashContent = string | Buffer | Uint8Array;

/** Shell 单参数安全转义，用于拼接传给 sandbox 的命令。 */
export const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

/** 去掉 sandbox 路径右侧斜杠，根路径保持可继续拼接的空前缀。 */
export const trimSandboxPathRight = (value: string) =>
  value === '/' ? '' : value.replace(/\/+$/, '');

/** 用 sandbox 语义拼接路径，避免不同 provider 工作目录末尾斜杠导致双斜杠。 */
export const joinSandboxPath = (basePath: string, path: string) =>
  `${trimSandboxPathRight(basePath)}/${path}`;

/** 构建 runtime 状态和 manifest 统一使用的内容 hash。 */
export const buildRuntimeHash = (content: HashContent): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`;
