import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  appWorkflow2Form,
  form2AppWorkflow
} from '@/pageComponents/app/detail/Edit/SimpleApp/utils';
import { describe, expect, it } from 'vitest';

const getModelInputs = ({ modelId, model }: { modelId?: string; model?: string }) => {
  const form = getDefaultAppForm();
  form.aiSettings.modelId = modelId;
  form.aiSettings.model = model;

  const workflow = form2AppWorkflow(form, (key: string) => key);
  return workflow.nodes
    .flatMap((node) => node.inputs)
    .filter((input) =>
      [NodeInputKeyEnum.aiModelId, NodeInputKeyEnum.aiModel].includes(input.key as NodeInputKeyEnum)
    );
};

describe('form2AppWorkflow model reference', () => {
  it('preserves an empty modelId instead of falling back to legacy model', () => {
    expect(getModelInputs({ modelId: '', model: 'legacy-model' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: '' }),
        expect.objectContaining({ key: NodeInputKeyEnum.aiModel, value: 'legacy-model' })
      ])
    );
  });

  it('emits only the legacy reference when modelId is absent', () => {
    const inputs = getModelInputs({ model: 'legacy-model' });

    expect(inputs).toEqual([
      expect.objectContaining({ key: NodeInputKeyEnum.aiModel, value: 'legacy-model' })
    ]);
  });

  it('keeps the canonical input shape when no model reference exists', () => {
    expect(getModelInputs({ model: '' })).toEqual([
      expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: undefined })
    ]);
  });

  it('preserves empty dataset model IDs instead of falling back to legacy fields', () => {
    const form = getDefaultAppForm();
    form.dataset.datasets = [
      {
        datasetId: 'dataset-id',
        avatar: 'dataset.svg',
        name: 'Dataset',
        vectorModel: { model: 'embedding-model' }
      }
    ];
    form.dataset.rerankModelId = '';
    form.dataset.rerankModel = 'legacy-rerank';
    form.dataset.datasetSearchExtensionModelId = '';
    form.dataset.datasetSearchExtensionModel = 'legacy-extension';

    const inputs = form2AppWorkflow(form, (key: string) => key).nodes.flatMap(
      (node) => node.inputs
    );

    expect(inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: NodeInputKeyEnum.datasetSearchRerankModelId, value: '' }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModel,
          value: 'legacy-rerank'
        }),
        expect.objectContaining({ key: NodeInputKeyEnum.datasetSearchExtensionModelId, value: '' }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchExtensionModel,
          value: 'legacy-extension'
        })
      ])
    );
  });

  it('round-trips collectionFilterMatch through the dataset search node', () => {
    const form = getDefaultAppForm();
    form.dataset.datasets = [
      {
        datasetId: 'dataset-id',
        avatar: 'dataset.svg',
        name: 'Dataset',
        vectorModel: { model: 'embedding-model' }
      }
    ];
    form.dataset.collectionFilterMatch = {
      logic: 'AND',
      conditions: [{ tag: 'price', tagType: 'number', op: '$gte', value: 10 }]
    };

    const workflow = form2AppWorkflow(form, (key: string) => key);
    const input = workflow.nodes
      .flatMap((node) => node.inputs)
      .find((item) => item.key === NodeInputKeyEnum.collectionFilterMatch);

    expect(input).toMatchObject({
      key: NodeInputKeyEnum.collectionFilterMatch,
      renderTypeList: ['datasetTagFilter', 'reference'],
      value: form.dataset.collectionFilterMatch
    });
    expect(
      appWorkflow2Form({ nodes: workflow.nodes, chatConfig: form.chatConfig }).dataset
        .collectionFilterMatch
    ).toEqual(form.dataset.collectionFilterMatch);
  });
});
