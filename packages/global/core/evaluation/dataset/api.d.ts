import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  EvalDatasetCollectionSchemaType,
  EvalDatasetDataSchemaType,
  EvalDatasetCollectionStatus,
  EvalDatasetDataQualityStatus,
  EvalDatasetDataQualityMetadata,
  EvalDatasetDataSynthesisMetadata
} from './type';
import type { EvalDatasetDataQualityResultEnum } from './constants';
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

export type listEvalDatasetCollectionV2Body = {
  searchKey?: string;
  pageSize?: number;
  pageNum?: number;
  offset?: number;
};

export type listEvalDatasetCollectionV2Response = PaginationResponse<
  Pick<EvalDatasetCollectionSchemaType, '_id' | 'name' | 'createTime'>
>;
type QualityEvaluationBase = {
  enableQualityEvaluation: boolean;
  evaluationModel?: string;
};

export type importEvalDatasetFromFileBody = {
  collectionId?: string; // Optional - use existing collection mode
  // Optional fields for creating new collection mode
  name?: string;
  description?: string;
} & QualityEvaluationBase;
type EvalDatasetDataBase = {
  [EvalDatasetDataKeyEnum.UserInput]: string;
  [EvalDatasetDataKeyEnum.ActualOutput]?: string;
  [EvalDatasetDataKeyEnum.ExpectedOutput]: string;
  [EvalDatasetDataKeyEnum.Context]?: string[];
  [EvalDatasetDataKeyEnum.RetrievalContext]?: string[];
  qualityMetadata?: Partial<EvalDatasetDataQualityMetadata>;
  synthesisMetadata?: Partial<EvalDatasetDataSynthesisMetadata>;
  qualityResult?: EvalDatasetDataQualityResultEnum;
};

export type createEvalDatasetDataBody = EvalDatasetDataBase &
  QualityEvaluationBase & {
    collectionId: string;
  };

export type listEvalDatasetDataBody = PaginationProps<{
  collectionId: string;
  searchKey?: string;
  status?: EvalDatasetDataQualityStatus;
  qualityResult?: EvalDatasetDataQualityResultEnum;
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
    | 'qualityMetadata'
    | 'synthesisMetadata'
    | 'qualityResult'
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
  | 'evalDatasetCollectionId'
  | EvalDatasetDataKeyEnum.UserInput
  | EvalDatasetDataKeyEnum.ActualOutput
  | EvalDatasetDataKeyEnum.ExpectedOutput
  | EvalDatasetDataKeyEnum.Context
  | EvalDatasetDataKeyEnum.RetrievalContext
  | 'qualityMetadata'
  | 'synthesisMetadata'
  | 'qualityResult'
  | 'createFrom'
  | 'createTime'
  | 'updateTime'
>;

export type smartGenerateEvalDatasetBody = {
  collectionId?: string;
  kbDatasetIds: string[];
  count?: number;
  intelligentGenerationModel: string;
  // Optional fields for creating new collection
  name?: string;
  description?: string;
};

export type listFailedTasksBody = {
  collectionId: string;
};

export type listFailedTasksResponse = {
  tasks: Array<{
    jobId: string;
    // all about dataset
    dataId: string;
    datasetId: string;
    datasetName: string;
    collectionId: string;
    collectionName: string;
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

export type retryAllTaskBody = {
  collectionId: string;
};

export type retryAllTaskResponse = {
  success: boolean;
  message: string;
  totalFailedTasks: number;
  retriedTasks: number;
  failedRetries: number;
};

export type getEvalDatasetCollectionDetailQuery = {
  collectionId: string;
};

export type getEvalDatasetCollectionDetailResponse = Pick<
  EvalDatasetCollectionSchemaType,
  | '_id'
  | 'teamId'
  | 'tmbId'
  | 'name'
  | 'description'
  | 'createTime'
  | 'updateTime'
  | 'evaluationModel'
  | 'metadata'
> & {
  creatorAvatar?: string;
  creatorName?: string;
  status: EvalDatasetCollectionStatus;
  dataItemsCount: number;
};
