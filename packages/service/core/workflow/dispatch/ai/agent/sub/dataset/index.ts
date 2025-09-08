import type { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';

export type DatasetConfigType = {
  [NodeInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [NodeInputKeyEnum.datasetSimilarity]: number;
  [NodeInputKeyEnum.datasetMaxTokens]: number;
  [NodeInputKeyEnum.userChatInput]?: string;
  [NodeInputKeyEnum.datasetSearchMode]: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;

  [NodeInputKeyEnum.datasetSearchUsingReRank]: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;

  [NodeInputKeyEnum.collectionFilterMatch]: string;
  [NodeInputKeyEnum.authTmbId]?: boolean;

  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]: string;
};
