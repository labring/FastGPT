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

const CLAIM_NAME = 'fastgpt-session-a1b2c3d4e5f6a1b2c3d4e5f6-generation';

describe('VolumeService', () => {
  let driver: IVolumeDriver;
  let service: VolumeService;

  beforeEach(() => {
    driver = makeDriver();
    service = new VolumeService(driver);
  });

  it('delegates ensure to driver', async () => {
    vi.mocked(driver.ensure).mockResolvedValue({
      claimName: CLAIM_NAME,
      created: true
    });
    const result = await service.ensure({ claimName: CLAIM_NAME, storageSize: '5Gi' });
    expect(driver.ensure).toHaveBeenCalledWith({ claimName: CLAIM_NAME, storageSize: '5Gi' });
    expect(result.created).toBe(true);
  });

  it('delegates remove to driver', async () => {
    vi.mocked(driver.remove).mockResolvedValue(undefined);
    await service.remove(CLAIM_NAME);
    expect(driver.remove).toHaveBeenCalledWith(CLAIM_NAME);
  });
});
