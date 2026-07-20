import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.VECTOR);

export enum FeatureLevel {
  V24 = 'V24',
  V26 = 'V26',
  UNKNOWN = 'UNKNOWN'
}

export class MilvusVersionManager {
  private featureLevel: FeatureLevel = FeatureLevel.UNKNOWN;
  private detectionPromise: Promise<FeatureLevel> | null = null;

  private constructor() {}

  static getInstance(): MilvusVersionManager {
    if (!global.milvusVersionManager) {
      global.milvusVersionManager = new MilvusVersionManager();
    }
    return global.milvusVersionManager;
  }

  async detectVersion(client: MilvusClient): Promise<FeatureLevel> {
    if (this.detectionPromise) return this.detectionPromise;

    this.detectionPromise = this.runDetection(client).finally(() => {
      this.detectionPromise = null;
    });

    return this.detectionPromise;
  }

  private async runDetection(client: MilvusClient): Promise<FeatureLevel> {
    try {
      const versionInfo = await client.getVersion();
      const version = versionInfo?.version || '';

      logger.info('Milvus server version detected', { milvusVersion: version });

      const match = version.match(/v?(\d+)\.(\d+)/);
      if (!match) {
        throw new Error(`Invalid version format: ${version}`);
      }

      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);

      if (major > 2 || (major === 2 && minor >= 6)) {
        this.featureLevel = FeatureLevel.V26;
      } else {
        this.featureLevel = FeatureLevel.V24;
      }

      logger.info('Milvus feature level set', {
        milvusVersion: version,
        featureLevel: this.featureLevel
      });
      return this.featureLevel;
    } catch (error) {
      logger.error('Milvus version detection failed, defaulting to UNKNOWN', {
        errorType: 'version_detection_failed',
        error: error instanceof Error ? error.message : String(error)
      });
      this.featureLevel = FeatureLevel.UNKNOWN;
      return this.featureLevel;
    }
  }

  async resetDetection(client: MilvusClient): Promise<FeatureLevel> {
    this.featureLevel = FeatureLevel.UNKNOWN;
    return this.detectVersion(client);
  }

  supportsFullText(): boolean {
    return this.featureLevel === FeatureLevel.V26;
  }

  getFeatureLevel(): FeatureLevel {
    return this.featureLevel;
  }
}

export const milvusVersionManager = MilvusVersionManager.getInstance();
