import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env before importing service (logger transitively imports env)
vi.mock('../../src/env', () => ({
  env: { VM_LOG_LEVEL: 'none' }
}));

import { VolumeService } from '../../src/services/VolumeService';
import type { IVolumeDriver } from '../../src/drivers/IVolumeDriver';

function makeDriver(): IVolumeDriver {
  return {
    ensure: vi.fn(),
    remove: vi.fn()
  };
}

const VALID_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';

describe('VolumeService', () => {
  let driver: IVolumeDriver;
  let service: VolumeService;

  beforeEach(() => {
    driver = makeDriver();
    service = new VolumeService(driver);
  });

  it('delegates ensure to driver', async () => {
    vi.mocked(driver.ensure).mockResolvedValue({
      claimName: 'fastgpt-session-' + VALID_ID,
      created: true
    });
    const result = await service.ensure(VALID_ID);
    expect(driver.ensure).toHaveBeenCalledWith(VALID_ID);
    expect(result.created).toBe(true);
  });

  it('delegates remove to driver', async () => {
    vi.mocked(driver.remove).mockResolvedValue(undefined);
    await service.remove(VALID_ID);
    expect(driver.remove).toHaveBeenCalledWith(VALID_ID);
  });
});
