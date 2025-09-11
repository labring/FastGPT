import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  EvalDatasetCollectionSchemaType,
  EvalDatasetDataSchemaType,
  EvalDatasetCollectionStatus,
  EvalDatasetDataQualityStatus
} from './type';
import type { EvalDatasetDataKeyEnum } from './constants';

type EvalDatasetCollectionBase = {
  name: string;
  description?: string;
  evaluationModel?: string;
};

export type createEvalDatasetCollectionBody = EvalDatasetCollectionBase;

export type updateEvalDatasetCollectionBody = Omit<EvalDatasetCollectionBase, 'name'> & {
  name?: string;
  collectionId: string;
};

export type deleteEvalDatasetCollectionQuery = {
  collectionId: string;
};

export type listEvalDatasetCollectionBody = PaginationProps<{
  searchKey?: string;
}>;

export type listEvalDatasetCollectionResponse = PaginationResponse<
  Pick<
    EvalDatasetCollectionSchemaType,
    '_id' | 'name' | 'description' | 'createTime' | 'updateTime'
  > & {
    creatorAvatar?: string;
    creatorName?: string;
    status: EvalDatasetCollectionStatus;
    dataItemsCount: number;
  }
>;
type QualityEvaluationBase = {
  enableQualityEvaluation: boolean;
  evaluationModel?: string;
};

export type importEvalDatasetFromFileBody = {
  fileId: string;
  collectionId: string;
} & QualityEvaluationBase;
type EvalDatasetDataBase = {
  [EvalDatasetDataKeyEnum.UserInput]: string;
  [EvalDatasetDataKeyEnum.ActualOutput]?: string;
  [EvalDatasetDataKeyEnum.ExpectedOutput]: string;
  [EvalDatasetDataKeyEnum.Context]?: string[];
  [EvalDatasetDataKeyEnum.RetrievalContext]?: string[];
  [EvalDatasetDataKeyEnum.Metadata]?: Record<string, any>;
};

export type createEvalDatasetDataBody = EvalDatasetDataBase &
  QualityEvaluationBase & {
    collectionId: string;
  };

export type listEvalDatasetDataBody = PaginationProps<{
  collectionId: string;
  searchKey?: string;
  status?: EvalDatasetDataQualityStatus;
}>;

export type listEvalDatasetDataResponse = PaginationResponse<
  Pick<
    EvalDatasetDataSchemaType,
    | '_id'
    | EvalDatasetDataKeyEnum.UserInput
    | EvalDatasetDataKeyEnum.ActualOutput
    | EvalDatasetDataKeyEnum.ExpectedOutput
    | EvalDatasetDataKeyEnum.Context
    | EvalDatasetDataKeyEnum.RetrievalContext
    | 'metadata'
    | 'createFrom'
    | 'createTime'
    | 'updateTime'
  >
>;

export type updateEvalDatasetDataBody = EvalDatasetDataBase & {
  dataId: string;
};

export type qualityAssessmentBody = {
  dataId: string;
  evaluationModel?: string;
};

export type qualityAssessmentBatchBody = {
  collectionId: string;
  evaluationModel?: string;
};

export type qualityAssessmentBatchResponse = {
  success: boolean;
  message: string;
  processedCount: number;
  skippedCount: number;
  errorCount: number;
};

export type deleteEvalDatasetDataQuery = {
  dataId: string;
};

export type getEvalDatasetDataDetailQuery = {
  dataId: string;
};

export type getEvalDatasetDataDetailResponse = Pick<
  EvalDatasetDataSchemaType,
  | '_id'
  | 'teamId'
  | 'tmbId'
  | 'datasetId'
  | EvalDatasetDataKeyEnum.UserInput
  | EvalDatasetDataKeyEnum.ActualOutput
  | EvalDatasetDataKeyEnum.ExpectedOutput
  | EvalDatasetDataKeyEnum.Context
  | EvalDatasetDataKeyEnum.RetrievalContext
  | EvalDatasetDataKeyEnum.Metadata
  | 'createFrom'
  | 'createTime'
  | 'updateTime'
>;

export type smartGenerateEvalDatasetBody = {
  collectionId: string;
  kbDatasetIds: string[];
  count?: number;
  intelligentGenerationModel: string;
};

export type listFailedTasksBody = {
  collectionId: string;
};

export type listFailedTasksResponse = {
  tasks: Array<{
    jobId: string;
    dataId: string;
    errorMessage: string;
    failedAt: Date;
    attemptsMade: number;
    maxAttempts: number;
  }>;
};

export type retryTaskBody = {
  collectionId: string;
  jobId: string;
};

export type deleteTaskBody = {
  collectionId: string;
  jobId: string;
};
