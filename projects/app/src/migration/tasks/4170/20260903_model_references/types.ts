import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

export type ModelRequirement = {
  type: ModelTypeEnum;
  vision?: boolean;
};

export type ReferenceTransformResult = {
  set?: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
  delete?: boolean;
  errors?: string[];
};

export type FailedRecord = SystemMigrationFailedRecord;
