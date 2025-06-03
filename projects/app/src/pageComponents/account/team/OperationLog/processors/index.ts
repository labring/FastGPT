import type { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { createTeamProcessors } from './teamProcessors';
import { createAppProcessors } from './appProcessors';
import { createDatasetProcessors } from './datasetProcessors';

export type MetadataProcessor = (metadata: any, t: any) => any;
export const specialProcessors: Partial<Record<OperationLogEventEnum, MetadataProcessor>> = {
  ...createTeamProcessors,
  ...createAppProcessors,
  ...createDatasetProcessors
};
