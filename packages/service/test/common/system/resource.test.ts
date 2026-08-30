import { beforeEach, describe, expect, it, vi } from 'vitest';

const osMock = vi.hoisted(() => ({
  availableParallelism: vi.fn(),
  cpus: vi.fn(),
  totalmem: vi.fn()
}));

vi.mock('node:os', () => osMock);

const { getSystemCpuInfo, getSystemMemoryInfo, getSystemResourceInfo } =
  await import('@fastgpt/service/common/system/resource');

describe('common/system/resource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    osMock.availableParallelism.mockReset();
    osMock.cpus.mockReset();
    osMock.totalmem.mockReset();
    osMock.availableParallelism.mockReturnValue(4);
    osMock.cpus.mockReturnValue(Array.from({ length: 8 }, () => ({})));
    osMock.totalmem.mockReturnValue(16 * 1024 ** 3);
    vi.spyOn(process, 'constrainedMemory').mockReturnValue(4 * 1024 ** 3);
    vi.spyOn(process, 'availableMemory').mockReturnValue(3 * 1024 ** 3);
  });

  it('返回容器感知的 CPU 与内存快照', () => {
    expect(getSystemResourceInfo()).toEqual({
      cpu: {
        availableCpuCount: 4,
        logicalCpuCount: 8
      },
      memory: {
        totalMemoryBytes: 16 * 1024 ** 3,
        constrainedMemoryBytes: 4 * 1024 ** 3,
        availableMemoryBytes: 3 * 1024 ** 3
      }
    });
  });

  it('CPU 配额无效时回退逻辑 CPU 数并至少保留一个', () => {
    osMock.availableParallelism.mockReturnValue(Number.NaN);
    osMock.cpus.mockReturnValue([]);

    expect(getSystemCpuInfo()).toEqual({
      availableCpuCount: 1,
      logicalCpuCount: 1
    });
  });

  it('没有容器内存约束时回退总内存，并截断异常可用内存', () => {
    vi.mocked(process.constrainedMemory).mockReturnValue(0);
    vi.mocked(process.availableMemory).mockReturnValue(32 * 1024 ** 3);

    expect(getSystemMemoryInfo()).toEqual({
      totalMemoryBytes: 16 * 1024 ** 3,
      constrainedMemoryBytes: 16 * 1024 ** 3,
      availableMemoryBytes: 16 * 1024 ** 3
    });
  });
});
