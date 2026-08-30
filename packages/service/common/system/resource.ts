import { availableParallelism, cpus, totalmem } from 'node:os';
import { formatFileSize } from '@fastgpt/global/common/file/tools';

export type SystemCpuInfo = {
  availableCpuCount: number;
  logicalCpuCount: number;
};

export type SystemMemoryInfo = {
  totalMemoryBytes: number;
  constrainedMemoryBytes: number;
  availableMemoryBytes: number;
};

export type SystemResourceInfo = {
  cpu: SystemCpuInfo;
  memory: SystemMemoryInfo;
};

export type ReadableSystemResourceInfo = {
  cpu: {
    available: number;
  };
  memory: {
    limit: string;
    available: string;
  };
};

/**
 * 获取当前进程可用的 CPU 信息。
 *
 * `availableParallelism` 会考虑容器 CPU 配额和进程亲和性；无法取得有效值时回退到
 * 系统逻辑 CPU 数，最终至少返回一个可用 CPU。
 */
export const getSystemCpuInfo = (): SystemCpuInfo => {
  const logicalCpuCount = Math.max(1, cpus().length || 1);
  const detectedAvailableCpuCount = availableParallelism?.();
  const availableCpuCount =
    Number.isFinite(detectedAvailableCpuCount) && detectedAvailableCpuCount > 0
      ? Math.floor(detectedAvailableCpuCount)
      : logicalCpuCount;

  return {
    availableCpuCount: Math.max(1, availableCpuCount),
    logicalCpuCount
  };
};

/**
 * 获取当前进程可用的内存信息。
 *
 * 优先使用 Node.js 识别到的容器/cgroup 内存约束；没有有效约束时回退到系统总内存。
 * 可用内存会被约束上限截断，避免宿主机数值大于容器实际可用范围。
 */
export const getSystemMemoryInfo = (): SystemMemoryInfo => {
  const detectedTotalMemoryBytes = totalmem();
  const totalMemoryBytes =
    Number.isFinite(detectedTotalMemoryBytes) && detectedTotalMemoryBytes > 0
      ? detectedTotalMemoryBytes
      : 0;
  const detectedConstrainedMemoryBytes = process.constrainedMemory();
  const constrainedMemoryBytes =
    Number.isFinite(detectedConstrainedMemoryBytes) && detectedConstrainedMemoryBytes > 0
      ? detectedConstrainedMemoryBytes
      : totalMemoryBytes;
  const detectedAvailableMemoryBytes = process.availableMemory();
  const availableMemoryBytes = Number.isFinite(detectedAvailableMemoryBytes)
    ? Math.min(Math.max(0, detectedAvailableMemoryBytes), constrainedMemoryBytes)
    : 0;

  return {
    totalMemoryBytes,
    constrainedMemoryBytes,
    availableMemoryBytes
  };
};

/** 获取当前进程统一的 CPU 与内存资源快照。 */
export const getSystemResourceInfo = (): SystemResourceInfo => ({
  cpu: getSystemCpuInfo(),
  memory: getSystemMemoryInfo()
});

/** 获取适合启动日志展示的系统资源快照，不改变调度使用的原始字节值。 */
export const getReadableSystemResourceInfo = (): ReadableSystemResourceInfo => {
  const { cpu, memory } = getSystemResourceInfo();

  return {
    cpu: {
      available: cpu.availableCpuCount
    },
    memory: {
      limit: formatFileSize(memory.constrainedMemoryBytes),
      available: formatFileSize(memory.availableMemoryBytes)
    }
  };
};
