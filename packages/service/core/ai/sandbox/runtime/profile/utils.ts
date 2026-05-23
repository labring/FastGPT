/** 去掉 sandbox 路径右侧斜杠，根路径保持可继续拼接的空前缀。 */
export const trimSandboxPathRight = (value: string) =>
  value === '/' ? '' : value.replace(/\/+$/, '');

/** 用 sandbox 语义拼接路径，避免不同 provider 工作目录末尾斜杠导致双斜杠。 */
export const joinSandboxPath = (basePath: string, path: string) =>
  `${trimSandboxPathRight(basePath)}/${path}`;

/** FastGPT 约定所有 skill 包都写入运行态工作目录下的 skills 子目录。 */
export const getSandboxSkillsRootPath = (workDirectory: string) =>
  joinSandboxPath(workDirectory, 'skills');

/**
 * 合并环境变量时让业务场景入参覆盖已有 createConfig。
 *
 * createConfig 可能来自调用方的 provider 扩展配置；场景入参代表 FastGPT 当前运行约定。
 */
export const mergeStringRecord = (
  base?: Record<string, string>,
  override?: Record<string, string>
): Record<string, string> | undefined => {
  const merged = {
    ...(base ?? {}),
    ...(override ?? {})
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
};

/** 合并 metadata，保持和 env 相同的“场景入参覆盖 createConfig”优先级。 */
export const mergeUnknownRecord = (
  base?: Record<string, unknown>,
  override?: Record<string, unknown>
): Record<string, unknown> | undefined => {
  const merged = {
    ...(base ?? {}),
    ...(override ?? {})
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
};

/** 把 FastGPT 内部的字符串入口脚本规整为 SDK create spec 使用的 argv 数组。 */
export const normalizeEntrypoint = (entrypoint?: string | string[]) => {
  if (!entrypoint) return undefined;
  const normalized = Array.isArray(entrypoint) ? entrypoint : [entrypoint];
  return normalized.length > 0 ? normalized : undefined;
};

/**
 * 构建 FastGPT 运行态在 sandbox 内约定的基础环境变量。
 *
 * 这些变量表达 FastGPT 自身的运行契约，provider 只负责把它们映射到实际 createConfig。
 */
export function buildBaseSandboxRuntimeEnv(
  sessionId: string,
  workDirectory: string
): Record<string, string> {
  return {
    FASTGPT_SESSION_ID: sessionId,
    FASTGPT_WORKDIR: workDirectory
  };
}
