import type { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { createTeamProcessors } from './teamProcessors';
import { createAppProcessors } from './appProcessors';
import { createDatasetProcessors } from './datasetProcessors';
import { createAdminProcessors } from './adminProcessors';

export type MetadataProcessor = (metadata: any, t: any) => any;
export const specialProcessors: Partial<Record<OperationLogEventEnum, MetadataProcessor>> = {
  ...createTeamProcessors,
  ...createAppProcessors,
  ...createDatasetProcessors,
  ...createAdminProcessors
};
