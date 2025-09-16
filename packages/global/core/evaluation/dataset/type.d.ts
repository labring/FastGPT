import type {
  EvaluationStatusEnum,
  EvalDatasetDataCreateFromEnum,
  EvalDatasetCollectionStatusEnum,
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataQualityResultEnum,
  EvalDatasetDataKeyEnum
} from './constants';
import type { Usage } from '@fastgpt/global/support/wallet/usage/type';

export type EvalDatasetCollectionStatus = EvalDatasetCollectionStatusEnum;
export type EvalDatasetDataQualityStatus = EvalDatasetDataQualityStatusEnum;
export type EvalDatasetDataQualityResult = EvalDatasetDataQualityResultEnum;

export type EvalDatasetDataQualityMetadata = {
  status: EvalDatasetDataQualityStatusEnum;
  score?: number;
  reason?: string;
  model?: string;
  usages?: Usage[];
  runLogs?: any[];
  startTime?: Date;
  finishTime?: Date;
  queueTime?: Date;
  error?: string;
};

export type EvalDatasetDataSynthesisMetadata = {
  sourceDataId?: string;
  sourceDatasetId?: string;
  sourceCollectionId?: string;
  intelligentGenerationModel?: string;
  synthesizedAt?: Date;
  generatedAt?: Date;
};

export type EvalDatasetCollectionSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description: string;
  createTime: Date;
  updateTime: Date;
  metadata: Record<string, any>;
  evaluationModel?: string;
};

export type EvalDatasetDataSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  evalDatasetCollectionId: string;
  [EvalDatasetDataKeyEnum.UserInput]: string;
  [EvalDatasetDataKeyEnum.ActualOutput]: string;
  [EvalDatasetDataKeyEnum.ExpectedOutput]: string;
  [EvalDatasetDataKeyEnum.Context]: string[];
  [EvalDatasetDataKeyEnum.RetrievalContext]: string[];
  qualityMetadata: EvalDatasetDataQualityMetadata;
  synthesisMetadata?: EvalDatasetDataSynthesisMetadata;
  qualityResult?: EvalDatasetDataQualityResultEnum;
  createFrom: EvalDatasetDataCreateFromEnum;
  createTime: Date;
  updateTime: Date;
};
