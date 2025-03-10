import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '../dataset/schema';
import { MongoApp } from '../app/schema';
import { getEmbeddingModel } from '../ai/model';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export type ListByAppIdAndDatasetIdsBody = {
  appId: string;
  datasetIdList: string[];
};

interface Dataset {
  datasetId: string;
  [key: string]: any;
}

export async function listByAppIdAndDatasetIds({
  appId,
  datasetIdList
}: ListByAppIdAndDatasetIdsBody) {
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new Error('App not found');
  }
  const { teamId } = app;

  const myDatasets = await MongoDataset.find({
    teamId,
    _id: { $in: datasetIdList },
    type: { $ne: DatasetTypeEnum.folder }
  }).lean();

  return myDatasets.map((item) => ({
    datasetId: item._id,
    avatar: item.avatar,
    name: item.name,
    vectorModel: getEmbeddingModel(item.vectorModel)
  }));
}

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

export async function restoreDatasetNode(formatNodes: StoreNodeItemType[]) {
  const datasetSearchNode = formatNodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode
  );
  if (datasetSearchNode) {
    const datasetsInput = datasetSearchNode.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSelectList
    );
    if (datasetsInput) {
      datasetsInput.value = datasetsInput.value.map((dataset: Dataset) => ({
        datasetId: dataset.datasetId
      }));
    }
  }
}
