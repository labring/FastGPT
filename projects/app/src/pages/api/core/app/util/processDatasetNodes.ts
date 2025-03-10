import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { listByAppIdAndDatasetIds } from './listByAppIdAndDatasetIds';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

export async function processDatasetNodes(nodes: any[], appId: string) {
  const datasetNodes = nodes
    .filter((node) => node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode)
    .map((node) => {
      const input = node.inputs.find(
        (item: { key: string; value: any }) => item.key === NodeInputKeyEnum.datasetSelectList
      );
      const rawIds = input?.value?.map((item: { datasetId: string }) => item.datasetId);
      const datasetIds = Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [];

      return { node, input, datasetIds };
    })
    .filter((item) => item.datasetIds.length > 0 && item.input);

  const allDatasetIds = datasetNodes.flatMap((item) => item.datasetIds);

  const uniqueDatasetIds = [...new Set(allDatasetIds)];

  if (uniqueDatasetIds.length === 0) return;

  const datasetList = await listByAppIdAndDatasetIds({
    appId,
    datasetIdList: uniqueDatasetIds
  });

  const datasetMap = new Map(datasetList.map((ds) => [ds.datasetId.toString(), ds]));

  datasetNodes.forEach(({ input, datasetIds }) => {
    input.value = datasetIds
      .map((id) => datasetMap.get(id))
      .filter(Boolean)
      .map(
        (item) =>
          item && {
            datasetId: item.datasetId,
            avatar: item.avatar,
            name: item.name,
            vectorModel: getEmbeddingModel(item.vectorModel.model)
          }
      );
  });
}
