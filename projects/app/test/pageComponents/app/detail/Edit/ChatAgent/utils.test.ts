import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  agentForm2AppWorkflow,
  appWorkflow2AgentForm
} from '@/pageComponents/app/detail/Edit/ChatAgent/utils';
import { describe, expect, it } from 'vitest';
import type { AppTTSConfigType } from '@fastgpt/global/core/app/type';

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

describe('agentForm2AppWorkflow TTS configuration', () => {
  it.each<AppTTSConfigType>([
    { type: 'none' },
    { type: 'web', speed: 1.2 },
    { type: 'model', modelId: 'tts-model', voice: 'alloy', speed: 0.8 }
  ])('preserves TTS settings through workflow save and form restore: %j', (ttsConfig) => {
    const form = getDefaultAppForm();
    form.chatConfig.ttsConfig = ttsConfig;
    form.chatConfig.welcomeText = 'Welcome';
    form.chatConfig.whisperConfig = { open: true, autoSend: false, autoTTSResponse: true };

    const workflow = agentForm2AppWorkflow(form, (key: string) => key);
    const restoredForm = appWorkflow2AgentForm(workflow);
    const restoredWorkflow = agentForm2AppWorkflow(restoredForm, (key: string) => key);

    for (const result of [workflow, restoredWorkflow]) {
      expect(result.chatConfig.ttsConfig).toEqual(ttsConfig);
      expect(result.chatConfig.whisperConfig).toEqual(form.chatConfig.whisperConfig);
      expect(result.chatConfig.welcomeText).toBe('Welcome');
    }
  });
});

describe('agentForm2AppWorkflow model reference', () => {
  it.each([undefined, false, true])('allows images independently of legacy vision=%s', (vision) => {
    const form = getDefaultAppForm();
    form.aiSettings.aiChatVision = vision;
    form.aiSettings.aiChatAudio = vision;
    form.aiSettings.aiChatVideo = vision;
    form.aiSettings.aiChatExtractFiles = vision;

    const workflow = agentForm2AppWorkflow(form, (key: string) => key);
    const restoredForm = appWorkflow2AgentForm(workflow);
    const restoredWorkflow = agentForm2AppWorkflow(restoredForm, (key: string) => key);

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
