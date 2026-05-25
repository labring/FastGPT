import { beforeEach, describe, expect, it, vi } from 'vitest';

const osMock = vi.hoisted(() => ({
  availableParallelism: vi.fn(),
  cpus: vi.fn()
}));

vi.mock('os', () => ({
  availableParallelism: osMock.availableParallelism,
  cpus: osMock.cpus
}));

import { getTokenWorkerCount } from '@fastgpt/service/worker/tokenWorkerConfig';

describe('token worker config', () => {
  beforeEach(() => {
    osMock.availableParallelism.mockReset();
    osMock.cpus.mockReset();
  });

  it('should cap token workers at 4 even when more CPU is available', () => {
    osMock.availableParallelism.mockReturnValue(10);

    expect(getTokenWorkerCount()).toBe(4);
  });

  it('should follow available CPU when fewer than 4 CPUs are available', () => {
    osMock.availableParallelism.mockReturnValue(2);

    expect(getTokenWorkerCount()).toBe(2);
  });

  it('should keep at least 1 token worker when CPU detection fails', () => {
    osMock.availableParallelism.mockReturnValue(undefined);
    osMock.cpus.mockReturnValue([]);

    expect(getTokenWorkerCount()).toBe(1);
  });
});
