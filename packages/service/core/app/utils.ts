import { MongoDataset } from '../dataset/schema';
import { getEmbeddingModel } from '../ai/model';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export async function listAppDatasetDataByTeamIdAndDatasetIds({
  teamId,
  datasetIdList
}: {
  teamId?: string;
  datasetIdList: string[];
}) {
  const myDatasets = await MongoDataset.find({
    _id: { $in: datasetIdList },
    ...(teamId && { teamId })
  }).lean();

  return myDatasets.map((item) => ({
    datasetId: String(item._id),
    avatar: item.avatar,
    name: item.name,
    vectorModel: getEmbeddingModel(item.vectorModel)
  }));
}

export async function rewriteAppWorkflowToDetail({
  nodes,
  teamId,
  isRoot
}: {
  nodes: StoreNodeItemType[];
  teamId: string;
  isRoot: boolean;
}) {
  const datasetIdSet = new Set<string>();

  // Get all dataset ids from nodes
  nodes.forEach((node) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return;

    const input = node.inputs.find((item) => item.key === NodeInputKeyEnum.datasetSelectList);
    if (!input) return;

    const rawValue = input.value as undefined | { datasetId: string }[] | { datasetId: string };
    if (!rawValue) return;

    const datasetIds = Array.isArray(rawValue)
      ? rawValue.map((v) => v?.datasetId).filter((id) => !!id && typeof id === 'string')
      : rawValue?.datasetId
        ? [String(rawValue.datasetId)]
        : [];

    datasetIds.forEach((id) => datasetIdSet.add(id));
  });

  if (datasetIdSet.size === 0) return;

  // Load dataset list
  const datasetList = await listAppDatasetDataByTeamIdAndDatasetIds({
    teamId: isRoot ? undefined : teamId,
    datasetIdList: Array.from(datasetIdSet)
  });
  const datasetMap = new Map(datasetList.map((ds) => [String(ds.datasetId), ds]));

  // Rewrite dataset ids, add dataset info to nodes
  if (datasetList.length > 0) {
    nodes.forEach((node) => {
      if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return;

      node.inputs.forEach((item) => {
        if (item.key !== NodeInputKeyEnum.datasetSelectList) return;

        const val = item.value as undefined | { datasetId: string }[] | { datasetId: string };

        if (Array.isArray(val)) {
          item.value = val
            .map((v) => {
              const data = datasetMap.get(String(v.datasetId));
              if (!data)
                return {
                  datasetId: v.datasetId,
                  avatar: '',
                  name: 'Dataset not found',
                  vectorModel: ''
                };
              return {
                datasetId: data.datasetId,
                avatar: data.avatar,
                name: data.name,
                vectorModel: data.vectorModel
              };
            })
            .filter(Boolean);
        } else if (typeof val === 'object' && val !== null) {
          const data = datasetMap.get(String(val.datasetId));
          if (!data) {
            item.value = [
              {
                datasetId: val.datasetId,
                avatar: '',
                name: 'Dataset not found',
                vectorModel: ''
              }
            ];
          } else {
            item.value = [
              {
                datasetId: data.datasetId,
                avatar: data.avatar,
                name: data.name,
                vectorModel: data.vectorModel
              }
            ];
          }
        }
      });
    });
  }

  return nodes;
}

export async function rewriteAppWorkflowToSimple(formatNodes: StoreNodeItemType[]) {
  formatNodes.forEach((node) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return;

    node.inputs.forEach((input) => {
      if (input.key === NodeInputKeyEnum.datasetSelectList) {
        const val = input.value as undefined | { datasetId: string }[] | { datasetId: string };
        if (!val) {
          input.value = [];
        } else if (Array.isArray(val)) {
          // Not rewrite reference value
          if (val.length === 2 && val.every((item) => typeof item === 'string')) {
            return;
          }
          input.value = val
            .map((dataset: { datasetId: string }) => ({
              datasetId: dataset.datasetId
            }))
            .filter((item) => !!item.datasetId);
        } else if (typeof val === 'object' && val !== null) {
          input.value = [
            {
              datasetId: val.datasetId
            }
          ];
        }
      }
    });
  });
}
