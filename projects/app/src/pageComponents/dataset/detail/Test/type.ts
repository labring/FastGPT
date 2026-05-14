import type { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

export type SearchTestFormType = {
  inputText: string;
  searchParams: {
    searchMode: DatasetSearchModeEnum;
    embeddingWeight?: number;

    usingReRank?: boolean;
    rerankModel?: string;
    rerankWeight?: number;

    similarity?: number;
    limit?: number;
    datasetSearchUsingExtensionQuery?: boolean;
    datasetSearchExtensionModel?: string;
    datasetSearchExtensionBg?: string;
  };
};

export type SearchTestImageRef = {
  key: string;
  previewUrl: string;
};
