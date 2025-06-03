import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { defaultMetadataProcessor } from './commonProcessor';
import { createTeamProcessors } from './teamProcessors';
import { createAppProcessors } from './appProcessors';
import { createDatasetProcessors } from './datasetProcessors';

export type MetadataProcessor = (metadata: any, t: any) => any;

export const createMetadataProcessorMap = (): Record<OperationLogEventEnum, MetadataProcessor> => {
  const specialProcessors: Partial<Record<OperationLogEventEnum, MetadataProcessor>> = {
    ...createTeamProcessors(),
    ...createAppProcessors(),
    ...createDatasetProcessors()
  };

  const processorMap = {} as Record<OperationLogEventEnum, MetadataProcessor>;

  Object.values(OperationLogEventEnum).forEach((event) => {
    processorMap[event] =
      specialProcessors[event] ||
      ((metadata: any, t: any) => defaultMetadataProcessor(metadata, t));
  });

  return processorMap;
};

export * from './commonProcessor';
export * from './teamProcessors';
export * from './appProcessors';
export * from './datasetProcessors';
