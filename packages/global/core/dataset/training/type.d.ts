import { PushDatasetDataChunkProps } from '../api';
import { TrainingModeEnum } from '../constants';

export type PushDataToTrainingQueueProps = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;

  mode?: TrainingModeEnum;
  data: PushDatasetDataChunkProps[];
  prompt?: string;

  agentModel: string;
  vectorModel: string;
  vlmModel?: string;

  indexSize?: number;

  billId?: string;
  session?: ClientSession;
};
