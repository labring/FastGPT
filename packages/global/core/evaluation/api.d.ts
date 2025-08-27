import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { EvalDatasetCollectionSchemaType, EvalDatasetDataSchemaType } from './type';

export type listEvaluationsBody = PaginationProps<{
  searchKey?: string;
}>;

export type listEvalItemsBody = PaginationProps<{
  evalId: string;
}>;

export type retryEvalItemBody = {
  evalItemId: string;
};

export type updateEvalItemBody = {
  evalItemId: string;
  question: string;
  expectedResponse: string;
  variables: Record<string, string>;
};

type EvalDatasetCollectionBase = {
  name: string;
  description?: string;
};

export type createEvalDatasetCollectionBody = EvalDatasetCollectionBase;

export type updateEvalDatasetCollectionBody = EvalDatasetCollectionBase & {
  collectionId: string;
};

export type listEvalDatasetCollectionBody = PaginationProps<{
  searchKey?: string;
}>;

export type listEvalDatasetCollectionResponse = PaginationResponse<
  Pick<
    EvalDatasetCollectionSchemaType,
    '_id' | 'name' | 'description' | 'createTime' | 'updateTime' | 'dataCountByGen'
  > & {
    creatorAvatar?: string;
    creatorName?: string;
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
  user_input: string;
  actual_output?: string;
  expected_output: string;
  context?: string[];
  retrieval_context?: string[];
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
    | 'user_input'
    | 'actual_output'
    | 'expected_output'
    | 'context'
    | 'retrieval_context'
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

export type deleteEvalDatasetDataQuery = {
  dataId: string;
};

export type smartGenerateEvalDatasetBody = {
  collectionId: string;
  datasetCollectionIds: string[];
  count?: number;
  intelligentGenerationModel: string;
};
