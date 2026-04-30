import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';

/**
 * Resolve dataset search params from workflow node inputs.
 *
 * Two paths exist:
 * 1. Agent application form: provides a composite agent_datasetParams object
 * 2. Workflow Agent node template: provides individual dataset fields (datasets, similarity, etc.)
 */
export const resolveDatasetParams = (
  params: Record<string, any>
): AppFormEditFormType['dataset'] | undefined => {
  // Composite path: Agent application form provides agent_datasetParams directly
  const composite = params[NodeInputKeyEnum.datasetParams] as
    | AppFormEditFormType['dataset']
    | undefined;
  if (composite?.datasets?.length) {
    return composite;
  }
  // Individual field path: workflow Agent node template provides separate fields
  const datasets = params[NodeInputKeyEnum.datasetSelectList];
  if (!datasets || !Array.isArray(datasets) || datasets.length === 0) {
    return undefined;
  }
  return {
    datasets,
    similarity: params[NodeInputKeyEnum.datasetSimilarity],
    limit: params[NodeInputKeyEnum.datasetMaxTokens],
    searchMode: params[NodeInputKeyEnum.datasetSearchMode],
    embeddingWeight: params[NodeInputKeyEnum.datasetSearchEmbeddingWeight],
    embeddingModel: params[NodeInputKeyEnum.datasetSearchEmbeddingModel],
    usingReRank: params[NodeInputKeyEnum.datasetSearchUsingReRank],
    rerankModel: params[NodeInputKeyEnum.datasetSearchRerankModel],
    rerankWeight: params[NodeInputKeyEnum.datasetSearchRerankWeight],
    datasetSearchUsingExtensionQuery: params[NodeInputKeyEnum.datasetSearchUsingExtensionQuery],
    datasetSearchExtensionModel: params[NodeInputKeyEnum.datasetSearchExtensionModel],
    datasetSearchExtensionBg: params[NodeInputKeyEnum.datasetSearchExtensionBg],
    collectionFilterMatch: params[NodeInputKeyEnum.collectionFilterMatch]
  } as AppFormEditFormType['dataset'];
};
