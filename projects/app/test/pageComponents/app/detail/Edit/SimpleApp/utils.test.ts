import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  appWorkflow2Form,
  form2AppWorkflow
} from '@/pageComponents/app/detail/Edit/SimpleApp/utils';
import { describe, expect, it } from 'vitest';
import { RunAppNode } from '@fastgpt/global/core/workflow/template/system/runApp';
import { Input_Template_Stream_MODE } from '@fastgpt/global/core/workflow/template/input';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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
  it.each([
    { type: FlowNodeTypeEnum.appModule, hasStreamInput: true },
    { type: FlowNodeTypeEnum.appModule, hasStreamInput: false },
    { type: FlowNodeTypeEnum.pluginModule, hasStreamInput: true },
    { type: FlowNodeTypeEnum.pluginModule, hasStreamInput: false }
  ])(
    'disables child streaming for $type (existing switch=$hasStreamInput)',
    ({ type, hasStreamInput }) => {
      const form = getDefaultAppForm();
      form.selectedTools = [
        {
          ...RunAppNode,
          flowNodeType: type,
          id: 'child-app',
          pluginId: 'child-app',
          name: 'Child app',
          inputs: hasStreamInput ? [{ ...Input_Template_Stream_MODE, value: false }] : [],
          outputs: []
        }
      ];
      const workflow = form2AppWorkflow(form, (key: string) => key);
      const childNode = workflow.nodes.find((node) => node.pluginId === 'child-app');
      expect(
        childNode?.inputs.find((input) => input.key === NodeInputKeyEnum.forbidStream)?.value
      ).toBe(true);
      expect(form.selectedTools[0].inputs).toEqual(
        hasStreamInput ? [{ ...Input_Template_Stream_MODE, value: false }] : []
      );
    }
  );

  it.each([
    [undefined, false],
    [false, false],
    [true, false],
    [undefined, true],
    [false, true],
    [true, true]
  ])('allows images with legacy vision=%s and sandbox=%s', (vision, useAgentSandbox) => {
    const form = getDefaultAppForm();
    form.aiSettings.aiChatVision = vision;
    form.aiSettings.aiChatAudio = vision;
    form.aiSettings.aiChatVideo = vision;
    form.aiSettings.aiChatExtractFiles = vision;
    form.aiSettings.useAgentSandbox = useAgentSandbox;

    const workflow = form2AppWorkflow(form, (key: string) => key);
    const restoredForm = appWorkflow2Form(workflow);
    const restoredWorkflow = form2AppWorkflow(restoredForm, (key: string) => key);

    for (const result of [workflow, restoredWorkflow]) {
      const inputs = result.nodes.flatMap((node) => node.inputs);
      for (const key of [
        NodeInputKeyEnum.aiChatVision,
        NodeInputKeyEnum.aiChatAudio,
        NodeInputKeyEnum.aiChatVideo,
        NodeInputKeyEnum.aiChatExtractFiles
      ]) {
        expect(inputs.filter((input) => input.key === key)).toEqual([
          expect.objectContaining({ value: true })
        ]);
      }
      expect(inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)?.value).toEqual(
        expect.arrayContaining([expect.any(Array)])
      );
    }
  });

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
});
