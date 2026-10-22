import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  agentForm2AppWorkflow,
  appWorkflow2AgentForm,
  loadGeneratedTools
} from '@/pageComponents/app/detail/Edit/ChatAgent/utils';
import { getNewToolPreviewNode } from '@/web/core/app/api/tool';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppTTSConfigType } from '@fastgpt/global/core/app/type';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { DatasetCollectionTagTypeEnum } from '@fastgpt/global/core/dataset/constants';

vi.mock('@/web/core/app/api/tool', () => ({ getNewToolPreviewNode: vi.fn() }));

describe('loadGeneratedTools', () => {
  const toolId = 'systemTool-shared';
  const createTool = (source?: string): SelectedToolItemType => ({
    id: toolId,
    pluginId: toolId,
    source,
    name: 'Shared tool',
    flowNodeType: FlowNodeTypeEnum.tool,
    inputs: [],
    outputs: []
  });

  beforeEach(() => {
    vi.mocked(getNewToolPreviewNode).mockReset();
    vi.mocked(getNewToolPreviewNode).mockImplementation(async ({ source }) => createTool(source));
  });

  it('loads team tools from their own source without reusing a same-ID system tool', async () => {
    const systemTool = createTool('system');
    const teamSource = 'teamId:team-1';
    const result = await loadGeneratedTools({
      newToolIds: [
        { id: toolId, source: 'system' },
        { id: toolId, source: teamSource }
      ],
      existsTools: [systemTool]
    });

    expect(result[0]).toBe(systemTool);
    expect(result[1]).toMatchObject({ id: toolId, source: teamSource });
    expect(getNewToolPreviewNode).toHaveBeenCalledExactlyOnceWith({
      appId: toolId,
      source: teamSource
    });
    const form = getDefaultAppForm();
    form.selectedTools = result;
    const workflow = agentForm2AppWorkflow(form, (key: string) => key);
    const savedTools = workflow.nodes
      .find((node) => node.flowNodeType === FlowNodeTypeEnum.agent)
      ?.inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)?.value;
    expect(savedTools).toEqual([
      expect.objectContaining({ id: toolId, source: 'system' }),
      expect.objectContaining({ id: toolId, source: teamSource })
    ]);
  });

  it('continues loading legacy string tool references', async () => {
    const result = await loadGeneratedTools({ newToolIds: [toolId] });

    expect(result).toEqual([expect.objectContaining({ id: toolId })]);
    expect(getNewToolPreviewNode).toHaveBeenCalledExactlyOnceWith({
      appId: toolId,
      source: undefined
    });
  });

  it.each([undefined, 'system'])(
    'preserves existing system configuration when the saved source is %s',
    async (source) => {
      const tool = {
        ...createTool(source),
        version: 'saved-version',
        inputs: [
          {
            key: 'apiKey',
            label: '',
            renderTypeList: [],
            value: 'saved-api-key'
          }
        ]
      };
      const result = await loadGeneratedTools({
        newToolIds: [{ id: toolId, source: 'system' }],
        existsTools: [tool]
      });

      expect(result).toEqual([{ ...tool, source: 'system' }]);
      expect(result[0].inputs).toBe(tool.inputs);
      expect(tool.source).toBe(source);
      expect(getNewToolPreviewNode).not.toHaveBeenCalled();

      const form = getDefaultAppForm();
      form.selectedTools = result;
      const savedTools = agentForm2AppWorkflow(form, (key: string) => key)
        .nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.agent)
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)?.value;
      expect(savedTools).toEqual([
        expect.objectContaining({
          id: toolId,
          source: 'system',
          version: 'saved-version',
          config: { apiKey: 'saved-api-key' }
        })
      ]);
    }
  );
});

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
  it('defaults search enhancements off and preserves explicitly enabled saved settings', () => {
    const empty = appWorkflow2AgentForm({ nodes: [], chatConfig: {} });
    expect(empty.dataset).toMatchObject({
      usingReRank: false,
      datasetSearchUsingExtensionQuery: false
    });
    const form = getDefaultAppForm();
    form.dataset.usingReRank = true;
    form.dataset.datasetSearchUsingExtensionQuery = true;
    const restored = appWorkflow2AgentForm(agentForm2AppWorkflow(form, (key: string) => key));
    expect(restored.dataset).toMatchObject({
      usingReRank: true,
      datasetSearchUsingExtensionQuery: true
    });
  });

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

  it.each([false, true])(
    'normalizes null dataset model references before saving when auxiliary search is enabled=%s',
    (enabled) => {
      const form = getDefaultAppForm();
      // 模拟历史配置或本地快照中的 null；表单类型本身只允许 string/undefined。
      Object.assign(form.dataset, {
        usingReRank: enabled,
        datasetSearchUsingExtensionQuery: enabled,
        rerankModelId: null,
        rerankModel: null,
        datasetSearchExtensionModelId: null,
        datasetSearchExtensionModel: null
      });
      form.chatConfig.questionGuide = { open: true, modelId: 'question-guide-model' };

      const workflow = agentForm2AppWorkflow(form, (key: string) => key);
      const restoredWorkflow = agentForm2AppWorkflow(
        appWorkflow2AgentForm(workflow),
        (key: string) => key
      );

      for (const result of [workflow, restoredWorkflow]) {
        const datasetParams = result.nodes
          .flatMap((node) => node.inputs)
          .find((input) => input.key === NodeInputKeyEnum.datasetParams)?.value;

        expect(datasetParams).toMatchObject({
          usingReRank: enabled,
          datasetSearchUsingExtensionQuery: enabled,
          rerankModelId: undefined,
          rerankModel: undefined,
          datasetSearchExtensionModelId: undefined,
          datasetSearchExtensionModel: undefined
        });
        expect(result.chatConfig.questionGuide).toEqual(form.chatConfig.questionGuide);
      }
    }
  );

  it('still rejects non-string dataset model references', () => {
    const form = getDefaultAppForm();
    Object.assign(form.dataset, { datasetSearchExtensionModelId: 123 });

    expect(() => agentForm2AppWorkflow(form, (key: string) => key)).toThrow();
  });

  it('round-trips the structured collection filter in nested agent params', () => {
    const form = getDefaultAppForm();
    form.dataset.collectionFilterMatch = {
      logic: 'AND',
      conditions: [
        { tag: 'price', tagType: DatasetCollectionTagTypeEnum.number, op: '$gte', value: 10 }
      ]
    };
    const workflow = agentForm2AppWorkflow(form, (key: string) => key);
    const datasetParams = workflow.nodes
      .flatMap((node) => node.inputs)
      .find((input) => input.key === NodeInputKeyEnum.datasetParams)?.value;
    expect(datasetParams).toMatchObject({
      collectionFilterMatch: form.dataset.collectionFilterMatch
    });
    expect(
      appWorkflow2AgentForm({ nodes: workflow.nodes, chatConfig: workflow.chatConfig }).dataset
        .collectionFilterMatch
    ).toEqual(form.dataset.collectionFilterMatch);
  });

  it('preserves name and avatar when converting selectedTools in agentForm2AppWorkflow', () => {
    const form = getDefaultAppForm();
    form.selectedTools = [
      {
        id: 'tool-node-1',
        pluginId: 'plugin-app-1',
        flowNodeType: FlowNodeTypeEnum.tool,
        name: 'My Custom Tool',
        avatar: 'custom-avatar.svg',
        inputs: [],
        metadataLocale: 'en',
        outputs: []
      }
    ];

    const workflow = agentForm2AppWorkflow(form, (key: string) => key);
    const agentNode = workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.agent);
    const selectedToolsInput = agentNode?.inputs.find(
      (input) => input.key === NodeInputKeyEnum.selectedTools
    );
    expect(selectedToolsInput?.value).toEqual([
      expect.objectContaining({
        id: 'plugin-app-1',
        name: 'My Custom Tool',
        avatar: 'custom-avatar.svg',
        metadataLocale: 'en'
      })
    ]);
    const restored = appWorkflow2AgentForm({
      nodes: workflow.nodes,
      chatConfig: workflow.chatConfig
    });
    expect(restored.selectedTools[0].metadataLocale).toBe('en');
  });
});
