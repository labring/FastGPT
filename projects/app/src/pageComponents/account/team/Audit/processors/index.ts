import type { TeamAuditEvent } from '@fastgpt/global/support/user/audit/constants';
import { createTeamProcessors } from './teamProcessors';
import { createAppProcessors } from './appProcessors';
import { createDatasetProcessors } from './datasetProcessors';

export type MetadataProcessor = (metadata: any, t: any) => any;
export const specialProcessors: Partial<Record<TeamAuditEvent, MetadataProcessor>> = {
  ...createTeamProcessors,
  ...createAppProcessors,
  ...createDatasetProcessors
};
