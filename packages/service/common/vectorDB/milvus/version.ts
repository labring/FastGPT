import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { addLog } from '../../system/log';

export enum MilvusFeatureLevel {
  V24 = 'v2.4',
  V26 = 'v2.6',
  UNKNOWN = 'unknown'
}

export class MilvusVersionManager {
  private featureLevel: MilvusFeatureLevel = MilvusFeatureLevel.UNKNOWN;
  private detectionComplete = false;

  private constructor() {}

  static getInstance(): MilvusVersionManager {
    if (!global.milvusVersionManager) {
      global.milvusVersionManager = new MilvusVersionManager();
    }
    return global.milvusVersionManager;
  }

  async detectVersion(client: MilvusClient): Promise<MilvusFeatureLevel> {
    if (this.detectionComplete) return this.featureLevel;

    try {
      // 调用 SDK getVersion()
      const versionInfo = await client.getVersion();
      const version = versionInfo.version; // "v2.6.0" or "v2.4.19"

      addLog.info(`Milvus server version detected: ${version}`);

      // 解析版本号
      const match = version.match(/v?(\d+)\.(\d+)/);
      if (!match) {
        throw new Error(`Invalid version format: ${version}`);
      }

      const [, major, minor] = match;
      const majorNum = parseInt(major, 10);
      const minorNum = parseInt(minor, 10);

      // 判断特性级别
      if (majorNum > 2 || (majorNum === 2 && minorNum >= 6)) {
        this.featureLevel = MilvusFeatureLevel.V26;
      } else {
        this.featureLevel = MilvusFeatureLevel.V24;
      }

      this.detectionComplete = true;

      addLog.info(`Milvus feature level: ${this.featureLevel}`);
      return this.featureLevel;
    } catch (error) {
      addLog.error('Milvus version detection failed, defaulting to UNKNOWN', error);
      this.featureLevel = MilvusFeatureLevel.UNKNOWN;
      return this.featureLevel;
    }
  }

  getFeatureLevel(): MilvusFeatureLevel {
    return this.featureLevel;
  }

  supportsFullText(): boolean {
    return this.featureLevel === MilvusFeatureLevel.V26;
  }

  async resetDetection(client: MilvusClient): Promise<void> {
    this.detectionComplete = false;
    await this.detectVersion(client);
  }
}

export const milvusVersionManager = MilvusVersionManager.getInstance();
