import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { EvalDatasetCollectionSchemaType } from './type';

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
