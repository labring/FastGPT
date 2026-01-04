import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  appWorkflow2AgentForm,
  agentForm2AppWorkflow,
  loadGeneratedTools
} from '@/pageComponents/app/detail/Edit/ChatAgent/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

vi.mock('@fastgpt/global/core/app/utils', () => ({
  getDefaultAppForm: vi.fn(() => ({
    aiSettings: {
      model: '',
      systemPrompt: '',
      temperature: 0.5,
      maxHistories: 5,
      aiChatTopP: 1
    },
    selectedTools: [],
    chatConfig: {}
  }))
}));
vi.mock('@fastgpt/global/core/app/formEdit/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/core/app/formEdit/utils')>();
  return {
    ...actual,
    getToolConfigStatus: vi.fn(() => ({ status: 'valid' })),
    validateToolConfiguration: vi.fn(() => true)
  };
});
vi.mock('@/web/core/app/api/tool', () => ({
  getToolPreviewNode: vi.fn()
}));
vi.mock('@fastgpt/global/core/workflow/utils', () => ({
  getAppChatConfig: vi.fn(({ chatConfig }) => chatConfig)
}));
vi.mock('@fastgpt/web/i18n/utils', () => ({
  i18nT: (str: string) => str
}));

const getToolConfigStatus = vi.mocked(
  await import('@fastgpt/global/core/app/formEdit/utils')
).getToolConfigStatus;
const validateToolConfiguration = vi.mocked(
  await import('@fastgpt/global/core/app/formEdit/utils')
).validateToolConfiguration;
const getToolPreviewNode = vi.mocked(await import('@/web/core/app/api/tool')).getToolPreviewNode;

describe('appWorkflow2AgentForm', () => {
  it('should map agent node inputs to defaultAppForm', () => {
    const nodes = [
      {
        nodeId: 'agent1',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          { key: NodeInputKeyEnum.aiModel, value: 'gpt-3.5' },
          { key: NodeInputKeyEnum.aiSystemPrompt, value: 'You are a bot.' },
          { key: NodeInputKeyEnum.aiChatTemperature, value: 0.7 },
          { key: NodeInputKeyEnum.history, value: 10 },
          { key: NodeInputKeyEnum.aiChatTopP, value: 0.9 },
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [
              {
                pluginId: 'tool1',
                flowNodeType: 'toolType',
                inputs: [],
                name: 'TestTool'
              }
            ]
          }
        ]
      }
    ];
    const chatConfig = { foo: 'bar' };
    const form = appWorkflow2AgentForm({ nodes, chatConfig });
    expect(form.aiSettings.model).toBe('gpt-3.5');
    expect(form.aiSettings.systemPrompt).toBe('You are a bot.');
    expect(form.aiSettings.temperature).toBe(0.7);
    expect(form.aiSettings.maxHistories).toBe(10);
    expect(form.aiSettings.aiChatTopP).toBe(0.9);
    expect(form.selectedTools.length).toBe(1);
    expect(form.selectedTools[0].id).toBe('tool1');
    expect(form.selectedTools[0].configStatus).toBe('valid');
  });

  it('should map systemConfig node and call getAppChatConfig', () => {
    const nodes = [
      {
        nodeId: 'sys1',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        inputs: [],
        outputs: []
      }
    ];
    const chatConfig = { config: 'x' };
    const form = appWorkflow2AgentForm({ nodes, chatConfig });
    expect(form.chatConfig).toEqual(chatConfig);
  });

  it('should handle missing selectedTools', () => {
    const nodes = [
      {
        nodeId: 'agent1',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          { key: NodeInputKeyEnum.aiModel, value: 'gpt-3.5' }
          // no selectedTools
        ]
      }
    ];
    const form = appWorkflow2AgentForm({ nodes, chatConfig: {} });
    expect(form.selectedTools).toEqual([]);
  });
});

describe('agentForm2AppWorkflow', () => {
  const t = (str: string) => str;

  it('should generate workflow nodes and edges', () => {
    const data = {
      aiSettings: {
        model: 'gpt-4',
        systemPrompt: 'Prompt',
        temperature: 0.5,
        maxHistories: 7,
        aiChatTopP: 1
      },
      selectedTools: [
        {
          pluginId: 'tool1',
          flowNodeType: 'toolType',
          name: 'Tool1',
          inputs: [
            { key: 'input1', value: 'val1' },
            { key: 'input2', value: 'val2' }
          ]
        }
      ],
      chatConfig: { foo: 'bar' }
    };
    const res = agentForm2AppWorkflow(data as any, t);
    expect(res.nodes.length).toBeGreaterThan(2);
    expect(res.edges.length).toBe(1);
    expect(res.chatConfig).toEqual({ foo: 'bar' });
    const agentNode = res.nodes.find((n: any) => n.flowNodeType === FlowNodeTypeEnum.agent);
    expect(agentNode).toBeDefined();
    const selectedToolsInput = agentNode.inputs.find(
      (i: any) => i.key === NodeInputKeyEnum.selectedTools
    );
    expect(selectedToolsInput).toBeDefined();
    expect(selectedToolsInput.value[0].id).toBe('tool1');
    expect(selectedToolsInput.value[0].config.input1).toBe('val1');
    expect(selectedToolsInput.value[0].config.input2).toBe('val2');
  });

  it('should handle empty selectedTools', () => {
    const data = {
      aiSettings: {
        model: 'gpt-4',
        systemPrompt: 'Prompt',
        temperature: 0.5,
        maxHistories: 7,
        aiChatTopP: 1
      },
      selectedTools: [],
      chatConfig: {}
    };
    const res = agentForm2AppWorkflow(data as any, t);
    const agentNode = res.nodes.find((n: any) => n.flowNodeType === FlowNodeTypeEnum.agent);
    const selectedToolsInput = agentNode.inputs.find(
      (i: any) => i.key === NodeInputKeyEnum.selectedTools
    );
    expect(selectedToolsInput.value).toEqual([]);
  });
});

describe('loadGeneratedTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return existsTools if already present', async () => {
    const existsTools = [
      {
        pluginId: 'tool1',
        name: 'Tool1',
        inputs: [],
        flowNodeType: 'toolType'
      }
    ];
    const result = await loadGeneratedTools({
      newToolIds: ['tool1'],
      existsTools
    });
    expect(result.length).toBe(1);
    expect(result[0].pluginId).toBe('tool1');
  });

  it('should fetch, validate, and merge tool if not in existsTools', async () => {
    getToolPreviewNode.mockResolvedValueOnce({
      pluginId: 'tool2',
      name: 'Tool2',
      inputs: [
        { key: 'input1', value: 'default', valueType: 'string' },
        { key: 'input2', value: 'default2', valueType: 'string' }
      ],
      flowNodeType: 'toolType'
    });
    validateToolConfiguration.mockReturnValueOnce(true);
    const result = await loadGeneratedTools({
      newToolIds: ['tool2'],
      existsTools: []
    });
    expect(getToolPreviewNode).toHaveBeenCalledWith({ appId: 'tool2' });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('tool2');
    expect(result[0].configStatus).toBe('valid');
  });

  it('should skip tool if validateToolConfiguration returns false', async () => {
    getToolPreviewNode.mockResolvedValueOnce({
      pluginId: 'tool3',
      name: 'Tool3',
      inputs: [],
      flowNodeType: 'toolType'
    });
    validateToolConfiguration.mockReturnValueOnce(false);
    const result = await loadGeneratedTools({
      newToolIds: ['tool3'],
      existsTools: []
    });
    expect(result.length).toBe(0);
  });

  it('should merge values from topAgentSelectedTools', async () => {
    getToolPreviewNode.mockResolvedValueOnce({
      pluginId: 'tool4',
      name: 'Tool4',
      inputs: [
        { key: 'input1', value: 'default', valueType: 'string' },
        { key: 'input2', value: 'default2', valueType: 'string' }
      ],
      flowNodeType: 'toolType'
    });
    validateToolConfiguration.mockReturnValueOnce(true);
    const topAgentSelectedTools = [
      {
        pluginId: 'tool4',
        name: 'Tool4',
        inputs: [
          { key: 'input1', value: 'top1', valueType: 'string' },
          { key: 'input2', value: 'top2', valueType: 'string' }
        ],
        flowNodeType: 'toolType'
      }
    ];
    const result = await loadGeneratedTools({
      newToolIds: ['tool4'],
      existsTools: [],
      topAgentSelectedTools
    });
    expect(result.length).toBe(1);
    expect(result[0].inputs[0].value).toBe('top1');
    expect(result[0].inputs[1].value).toBe('top2');
  });

  it('should pass fileSelectConfig to validateToolConfiguration', async () => {
    getToolPreviewNode.mockResolvedValueOnce({
      pluginId: 'tool5',
      name: 'Tool5',
      inputs: [],
      flowNodeType: 'toolType'
    });
    validateToolConfiguration.mockReturnValueOnce(true);
    const fileSelectConfig = { canSelectFile: true, canSelectImg: true };
    await loadGeneratedTools({
      newToolIds: ['tool5'],
      existsTools: [],
      fileSelectConfig
    });
    expect(validateToolConfiguration).toHaveBeenCalledWith({
      toolTemplate: expect.any(Object),
      canSelectFile: true,
      canSelectImg: true
    });
  });

  it('should filter out undefined results', async () => {
    getToolPreviewNode.mockResolvedValueOnce({
      pluginId: 'tool6',
      name: 'Tool6',
      inputs: [],
      flowNodeType: 'toolType'
    });
    validateToolConfiguration.mockReturnValueOnce(false);
    const result = await loadGeneratedTools({
      newToolIds: ['tool6'],
      existsTools: []
    });
    expect(result).toEqual([]);
  });
});
