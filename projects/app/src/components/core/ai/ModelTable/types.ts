import type { TFunction } from 'i18next';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { RerankTrainTaskListItem } from '@fastgpt/global/core/train/rerank/api';
import type { EmbeddingTrainTaskListItem } from '@fastgpt/global/core/train/embedding/api';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

export type TrainTaskItem = RerankTrainTaskListItem | EmbeddingTrainTaskListItem;

export const modelTableTabValues = {
  base: 'base',
  custom: 'custom'
} as const;

export type ModelTabType = (typeof modelTableTabValues)[keyof typeof modelTableTabValues];

export type FilterState = {
  provider: string | '';
  modelType: ModelTypeEnum | '';
  search: string;
};

export type ProviderOption = {
  label: React.ReactNode;
  value: string | '';
};

export type ModelRow = {
  model: string;
  name: string;
  avatar: string;
  providerId: string;
  providerName: string;
  typeLabel: string;
  priceLabel: React.ReactNode;
  order: number;
  tagColor: string;
  isTuned?: boolean;
  trainableModelType?: ModelTypeEnum.embedding | ModelTypeEnum.rerank;
  trainTaskList?: TrainTaskItem[];
};

export type { TeamPermission };

export type TrainDetailModel = {
  model: string;
  name: string;
  baseModelType: ModelTypeEnum.embedding | ModelTypeEnum.rerank;
};

export type OpenTrainModelHandler = (
  type: ModelTypeEnum.embedding | ModelTypeEnum.rerank,
  model: string
) => void;

export type I18nT = TFunction;
