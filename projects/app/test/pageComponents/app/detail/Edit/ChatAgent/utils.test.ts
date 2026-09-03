import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { agentForm2AppWorkflow } from '@/pageComponents/app/detail/Edit/ChatAgent/utils';
import { describe, expect, it } from 'vitest';

const getModelInputs = ({ modelId, model }: { modelId?: string; model?: string }) => {
  const form = getDefaultAppForm();
  form.aiSettings.modelId = modelId;
  form.aiSettings.model = model;

  const workflow = agentForm2AppWorkflow(form, (key: string) => key);
  return workflow.nodes
    .flatMap((node) => node.inputs)
    .filter((input) =>
      [NodeInputKeyEnum.aiModelId, NodeInputKeyEnum.aiModel].includes(input.key as NodeInputKeyEnum)
    );
};

describe('agentForm2AppWorkflow model reference', () => {
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

  it('preserves empty dataset model IDs in nested agent params', () => {
    const form = getDefaultAppForm();
    form.dataset.rerankModelId = '';
    form.dataset.rerankModel = 'legacy-rerank';
    form.dataset.datasetSearchExtensionModelId = '';
    form.dataset.datasetSearchExtensionModel = 'legacy-extension';

    const datasetParams = agentForm2AppWorkflow(form, (key: string) => key)
      .nodes.flatMap((node) => node.inputs)
      .find((input) => input.key === NodeInputKeyEnum.datasetParams)?.value;

    expect(datasetParams).toMatchObject({
      rerankModelId: '',
      rerankModel: 'legacy-rerank',
      datasetSearchExtensionModelId: '',
      datasetSearchExtensionModel: 'legacy-extension'
    });
  });
});
