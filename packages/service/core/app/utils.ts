import { MongoDataset } from '../dataset/schema';
import { getEmbeddingModel } from '../ai/model';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export type ListByAppIdAndDatasetIdsBody = {
  teamId: string;
  datasetIdList: string[];
};

interface Dataset {
  datasetId: string;
  [key: string]: any;
}

export async function listAppDatasetDataByTeamIdAndDatasetIds({
  teamId,
  datasetIdList
}: ListByAppIdAndDatasetIdsBody) {
  const myDatasets = await MongoDataset.find({
    teamId,
    _id: { $in: datasetIdList }
  }).lean();

  return myDatasets.map((item) => ({
    datasetId: item._id,
    avatar: item.avatar,
    name: item.name,
    vectorModel: getEmbeddingModel(item.vectorModel)
  }));
}

export async function rewriteAppWorkflowToDetail(nodes: StoreNodeItemType[], teamId: string) {
  const datasetIdSet = new Set<string>();

  nodes.forEach((node) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return;

    const input = node.inputs.find((item) => item.key === NodeInputKeyEnum.datasetSelectList);
    if (!input) return;

    const rawValue = input.value as undefined | { datasetId: string }[] | { datasetId: string };

    const datasetIds = Array.isArray(rawValue)
      ? rawValue
          .map((v) => v?.datasetId)
          .filter((id): id is string => !!id && typeof id === 'string')
      : rawValue?.datasetId
        ? [String(rawValue.datasetId)]
        : [];

    if (datasetIds.length === 0) return;

    datasetIds.forEach((id) => datasetIdSet.add(id));
  });

  if (datasetIdSet.size === 0) return;

  const uniqueDatasetIds = Array.from(datasetIdSet);
  const datasetList = await listAppDatasetDataByTeamIdAndDatasetIds({
    teamId,
    datasetIdList: uniqueDatasetIds
  });

  const datasetMap = new Map(
    datasetList.map((ds) => [
      String(ds.datasetId),
      {
        ...ds,
        vectorModel: getEmbeddingModel(ds.vectorModel.model)
      }
    ])
  );

  nodes.forEach((node) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return;

    const input = node.inputs.find((item) => item.key === NodeInputKeyEnum.datasetSelectList);
    if (!input) return;

    const rawValue = input.value as undefined | { datasetId: string }[] | { datasetId: string };

    const datasetIds = Array.isArray(rawValue)
      ? rawValue
          .map((v) => v?.datasetId)
          .filter((id): id is string => !!id && typeof id === 'string')
      : rawValue?.datasetId
        ? [String(rawValue.datasetId)]
        : [];

    if (datasetIds.length === 0) return;

    input.value = datasetIds
      .map((id) => {
        const data = datasetMap.get(String(id));
        return data
          ? {
              datasetId: data.datasetId,
              avatar: data.avatar,
              name: data.name,
              vectorModel: data.vectorModel
            }
          : undefined;
      })
      .filter((item): item is NonNullable<typeof item> => !!item);
  });
}

export async function rewriteAppWorkflowToSimple(formatNodes: StoreNodeItemType[]) {
  formatNodes.forEach((node) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return;

    const datasetsInput = node.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSelectList
    );
    if (datasetsInput?.value) {
      datasetsInput.value = datasetsInput.value.map((dataset: Dataset) => ({
        datasetId: dataset.datasetId
      }));
    }
  });
}
