import type { EnsureResult, EnsureVolumeParams, IVolumeDriver } from '../drivers/IVolumeDriver';
import { logDebug } from '../utils/logger';

export class VolumeService {
  constructor(private readonly driver: IVolumeDriver) {}

  async ensure(params: EnsureVolumeParams): Promise<EnsureResult> {
    logDebug(`VolumeService.ensure claimName=${params.claimName}`);
    const result = await this.driver.ensure(params);
    logDebug(`VolumeService.ensure done claimName=${result.claimName} created=${result.created}`);
    return result;
  }

  async remove(claimName: string): Promise<void> {
    logDebug(`VolumeService.remove claimName=${claimName}`);
    await this.driver.remove(claimName);
    logDebug(`VolumeService.remove done claimName=${claimName}`);
  }
}
