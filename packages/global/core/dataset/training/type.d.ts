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

  billId?: string;
  session?: ClientSession;
};
