import { PushDatasetDataChunkProps } from '../api';
import { TrainingModeEnum } from '../constants';

export type PushDataToTrainingQueueProps = {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  agentModel: string;
  vectorModel: string;
  mode?: TrainingModeEnum;
  data: PushDatasetDataChunkProps[];
  prompt?: string;

  billId?: string;
  session?: ClientSession;
};
