import { TrainingStatusEnum } from '@/constants/model';

export type TrainingItemType = {
  _id: string;
  serviceName: string;
  tuneId: string;
  modelId: string;
  status: `${TrainingStatusEnum}`;
};
