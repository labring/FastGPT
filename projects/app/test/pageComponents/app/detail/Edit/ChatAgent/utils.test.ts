import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  agentForm2AppWorkflow,
  appWorkflow2AgentForm,
  removeSelectedTool,
  upsertSelectedTool
} from '@/pageComponents/app/detail/Edit/ChatAgent/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { describe, expect, it } from 'vitest';
import type { AppTTSConfigType } from '@fastgpt/global/core/app/type';
import { DatasetCollectionTagTypeEnum } from '@fastgpt/global/core/dataset/constants';

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
    expect(
      agentNode?.inputs.find((input) => input.key === NodeInputKeyEnum.history)
    ).toBeUndefined();
  });

  it('upserts and removes selectedTools by canonical identity across implicit sources and legacy 3-segment child IDs', () => {
    const appId = '66f100000000000000000022';
    const teamTool = {
      id: 'systemTool-metaso',
      pluginId: 'systemTool-metaso',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: '团队秘塔',
      toolConfig: {
        systemTool: {
          toolId: 'systemTool-metaso',
          source: 'teamId:team-1'
        }
      },
      inputs: [],
      outputs: []
    };
    const systemTool = {
      id: 'systemTool-metaso',
      pluginId: 'systemTool-metaso',
      source: 'system',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: '官方秘塔',
      inputs: [],
      outputs: []
    };
    const legacyMcpChild = {
      id: `mcp-${appId}/OldSet/search`,
      pluginId: `mcp-${appId}/OldSet/search`,
      flowNodeType: FlowNodeTypeEnum.tool,
      name: '旧三段式搜索',
      toolConfig: {
        mcpTool: {
          toolId: `mcp-${appId}/search`
        }
      },
      inputs: [],
      outputs: []
    };
    const updatedMcpChild = {
      id: `mcp-${appId}/search`,
      pluginId: `mcp-${appId}/search`,
      flowNodeType: FlowNodeTypeEnum.tool,
      name: '规范两段式搜索',
      toolConfig: {
        mcpTool: {
          toolId: `mcp-${appId}/search`
        }
      },
      inputs: [],
      outputs: []
    };

    // 系统同名工具不能误覆盖仅在 toolConfig 保存来源的团队插件
    const afterAddSystem = upsertSelectedTool([teamTool, legacyMcpChild], systemTool);
    expect(afterAddSystem).toHaveLength(3);
    expect(afterAddSystem.map((item) => item.name)).toEqual([
      '官方秘塔',
      '团队秘塔',
      '旧三段式搜索'
    ]);

    // 规范两段式子工具应精准更新历史三段式子工具，而不是重复追加
    const afterUpdateChild = upsertSelectedTool(afterAddSystem, updatedMcpChild);
    expect(afterUpdateChild).toHaveLength(3);
    expect(afterUpdateChild[2].name).toBe('规范两段式搜索');

    // 按规范两段式 ID 或 team source 移除时精准命中对应条目
    const afterRemoveChild = removeSelectedTool(afterUpdateChild, { id: `mcp-${appId}/search` });
    expect(afterRemoveChild.map((item) => item.name)).toEqual(['官方秘塔', '团队秘塔']);

    const afterRemoveTeam = removeSelectedTool(afterRemoveChild, {
      id: 'systemTool-metaso',
      source: 'teamId:team-1'
    });
    expect(afterRemoveTeam.map((item) => item.name)).toEqual(['官方秘塔']);
  });
});
