import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  EvalDatasetCollectionSchemaType,
  EvalDatasetDataSchemaType,
  EvalDatasetCollectionStatus
} from './type';
import type { EvalDatasetDataKeyEnum } from './constants';

type EvalDatasetCollectionBase = {
  name: string;
  description?: string;
};

export type createEvalDatasetCollectionBody = EvalDatasetCollectionBase;

export type updateEvalDatasetCollectionBody = EvalDatasetCollectionBase & {
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
  qualityEvaluationModel?: string;
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
};

export type createEvalDatasetDataBody = EvalDatasetDataBase & {
  collectionId: string;
};

export type listEvalDatasetDataBody = PaginationProps<{
  collectionId: string;
  searchKey?: string;
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

export type updateEvalDatasetDataBody = EvalDatasetDataBase &
  QualityEvaluationBase & {
    dataId: string;
  };

export type qualityAssessmentBody = {
  dataId: string;
  evalModel: string;
};

export type qualityAssessmentBatchBody = {
  collectionId: string;
  evalModel: string;
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

export type smartGenerateEvalDatasetBody = {
  collectionId: string;
  datasetCollectionIds: string[];
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
