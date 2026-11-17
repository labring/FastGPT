import type { AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';

export type SearchTestFormType = {
  inputText: string;
  searchParams: Pick<
    AppDatasetSearchParamsType,
    | 'searchMode'
    | 'embeddingWeight'
    | 'usingReRank'
    | 'rerankModelId'
    | 'rerankWeight'
    | 'rerankCandidateNum'
    | 'similarity'
    | 'limit'
    | 'datasetSearchUsingExtensionQuery'
    | 'datasetSearchExtensionModelId'
    | 'datasetSearchExtensionBg'
  >;
};

export type SearchTestImageRef = {
  key: string;
  previewUrl: string;
};
