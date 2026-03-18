import type { IVolumeDriver, EnsureResult } from '../drivers/IVolumeDriver';
import { logDebug } from '../utils/logger';

export class VolumeService {
  constructor(private readonly driver: IVolumeDriver) {}

  async ensure(sessionId: string): Promise<EnsureResult> {
    logDebug(`VolumeService.ensure sessionId=${sessionId}`);
    const result = await this.driver.ensure(sessionId);
    logDebug(`VolumeService.ensure done claimName=${result.claimName} created=${result.created}`);
    return result;
  }

  async remove(sessionId: string): Promise<void> {
    logDebug(`VolumeService.remove sessionId=${sessionId}`);
    await this.driver.remove(sessionId);
    logDebug(`VolumeService.remove done sessionId=${sessionId}`);
  }
}
