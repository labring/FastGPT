import type {
  EvaluationStatusEnum,
  EvalDatasetDataCreateFromEnum,
  EvalDatasetCollectionStatusEnum,
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataKeyEnum
} from './constants';

export type EvalDatasetCollectionStatus = EvalDatasetCollectionStatusEnum;
export type EvalDatasetDataQualityStatus = EvalDatasetDataQualityStatusEnum;

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
  datasetId: string;
  [EvalDatasetDataKeyEnum.UserInput]: string;
  [EvalDatasetDataKeyEnum.ActualOutput]: string;
  [EvalDatasetDataKeyEnum.ExpectedOutput]: string;
  [EvalDatasetDataKeyEnum.Context]: string[];
  [EvalDatasetDataKeyEnum.RetrievalContext]: string[];
  metadata: Record<string, any>;
  createFrom: EvalDatasetDataCreateFromEnum;
  createTime: Date;
  updateTime: Date;
};
