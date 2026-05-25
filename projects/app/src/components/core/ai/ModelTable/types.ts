import type { TFunction } from 'i18next';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { TrainTaskSummary } from '@/pages/api/common/system/getInitData';
import type { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

export type TrainTaskItem = TrainTaskSummary['latestTask'];

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
  trainTaskSummary?: TrainTaskSummary;
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
