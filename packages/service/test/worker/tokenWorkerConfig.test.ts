import { beforeEach, describe, expect, it, vi } from 'vitest';

const resourceMock = vi.hoisted(() => ({
  getSystemCpuInfo: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/resource', () => ({
  getSystemCpuInfo: resourceMock.getSystemCpuInfo
}));

import { getTokenWorkerCount } from '@fastgpt/service/worker/tokenWorkerConfig';

describe('token worker config', () => {
  beforeEach(() => {
    resourceMock.getSystemCpuInfo.mockReset();
  });

  it('should cap token workers at 4 even when more CPU is available', () => {
    resourceMock.getSystemCpuInfo.mockReturnValue({
      availableCpuCount: 10,
      logicalCpuCount: 10
    });

    expect(getTokenWorkerCount()).toBe(4);
  });

  it('should follow available CPU when fewer than 4 CPUs are available', () => {
    resourceMock.getSystemCpuInfo.mockReturnValue({
      availableCpuCount: 2,
      logicalCpuCount: 10
    });

    expect(getTokenWorkerCount()).toBe(2);
  });

  it('should keep at least 1 token worker when CPU detection fails', () => {
    resourceMock.getSystemCpuInfo.mockReturnValue({
      availableCpuCount: 1,
      logicalCpuCount: 1
    });

    expect(getTokenWorkerCount()).toBe(1);
  });
});
