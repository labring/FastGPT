import { availableParallelism } from 'node:os';

type ResolveTestMaxWorkersProps = {
  override?: string;
  isCI: boolean;
  cpuCount: number;
};

/**
 * 计算单个 Vitest workspace 的 worker 数量。
 *
 * 显式配置优先；默认在 CI 使用 CPU - 1，本地使用 CPU / 2，至少保留一个 worker。
 */
export const resolveTestMaxWorkers = ({
  override,
  isCI,
  cpuCount
}: ResolveTestMaxWorkersProps): number | `${number}%` => {
  if (override?.endsWith('%')) return override as `${number}%`;

  const parsedOverride = Number(override);
  if (override && Number.isFinite(parsedOverride) && parsedOverride > 0) return parsedOverride;

  const normalizedCpuCount = Number.isFinite(cpuCount) && cpuCount > 0 ? Math.floor(cpuCount) : 1;
  return Math.max(1, isCI ? normalizedCpuCount - 1 : Math.floor(normalizedCpuCount / 2));
};

/** 获取当前运行环境下的 Vitest worker 数量。 */
export const getTestMaxWorkers = () =>
  resolveTestMaxWorkers({
    override: process.env.FASTGPT_TEST_MAX_WORKERS,
    isCI: Boolean(process.env.CI && !['0', 'false'].includes(process.env.CI.toLowerCase())),
    cpuCount: availableParallelism()
  });
