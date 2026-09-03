import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getDatasetEmbeddingModel } from '@fastgpt/service/core/dataset/model';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type {
  AppFormEditFormType,
  SelectedAgentSkillItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

const { getClientToolPreviewNodeMock, authAppByTmbIdMock } = vi.hoisted(() => ({
  getClientToolPreviewNodeMock: vi.fn(),
  authAppByTmbIdMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/utils/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/core/app/tool/utils/client')>();
  return {
    ...mod,
    getClientToolPreviewNode: getClientToolPreviewNodeMock
  };
});

vi.mock('@fastgpt/service/support/permission/app/auth', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/support/permission/app/auth')>();
  return {
    ...mod,
    authAppByTmbId: authAppByTmbIdMock
  };
});

const { rewriteAppWorkflowToDetail } = await import('@fastgpt/service/core/app/utils');

describe('rewriteAppWorkflowToDetail - current workflow tool inputs', () => {
  beforeEach(() => {
    getClientToolPreviewNodeMock.mockReset();
    authAppByTmbIdMock.mockReset();
  });

  it('keeps the baseline invalid placeholder and error detail', async () => {
    getClientToolPreviewNodeMock.mockRejectedValue(new Error('Tool deleted'));
    const nodes = [
      {
        nodeId: 'agent-1',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            label: 'Selected tools',
            renderTypeList: [FlowNodeInputTypeEnum.selectTool],
            value: [
              {
                id: 'systemTool-missing',
                version: 'v1',
                source: 'debug:tmbId:tmb-1',
                config: { apiKey: 'saved' },
                inputs: [{ key: 'query', mode: 'agentGenerated' }]
              }
            ]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });
    const tool = (nodes[0].inputs[0].value as any)[0];

    expect(tool).toMatchObject({
      pluginId: 'systemTool-missing',
      source: 'debug:tmbId:tmb-1',
      version: 'v1',
      config: { apiKey: 'saved' }
    });
    expect(tool.inputs).toEqual([{ key: 'query', mode: 'agentGenerated' }]);
    expect(tool.pluginData.error).toContain('Tool deleted');
  });

  it('checks snapshot-external personal tools before loading preview metadata', async () => {
    const toolAppId = '507f1f77bcf86cd799439011';
    authAppByTmbIdMock.mockRejectedValue(new Error('not allowed'));
    const nodes = [
      {
        nodeId: 'agent-1',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [{ id: toolAppId, config: {} }]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'owner-tmb',
      viewerTmbId: 'viewer-tmb',
      isRoot: false
    });

    const tool = (nodes[0].inputs[0].value as any)[0];
    expect(authAppByTmbIdMock).toHaveBeenCalledWith({
      tmbId: 'viewer-tmb',
      appId: toolAppId,
      per: expect.anything(),
      isRoot: false
    });
    expect(getClientToolPreviewNodeMock).not.toHaveBeenCalled();
    expect(tool.pluginData).toMatchObject({
      error: AppErrEnum.unAuthApp,
      permissionDenied: true
    });
  });

  it('普通节点不投影 customVariable 输入', async () => {
    const input = {
      key: 'externalVariable',
      label: 'External variable',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.customVariable],
      selectedType: FlowNodeInputTypeEnum.customVariable
    };
    const nodes = [
      {
        nodeId: 'ordinary-node',
        flowNodeType: FlowNodeTypeEnum.textEditor,
        inputs: [input],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toEqual(input);
  });

  it('preserves explicit current HTTP tool input modes', async () => {
    const nodes = [
      {
        nodeId: 'http-tool',
        flowNodeType: FlowNodeTypeEnum.httpRequest468,
        inputs: [
          {
            key: 'query',
            label: 'query',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference
          },
          {
            key: 'manual',
            label: 'manual',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference,
            defaultToAgentGenerated: false
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.reference
    });
    expect(nodes[0].inputs[1]).toMatchObject({
      defaultToAgentGenerated: false,
      selectedType: FlowNodeInputTypeEnum.reference
    });
  });
});

describe('rewriteAppWorkflowToDetail - workflow tool inputs', () => {
  it('preserves explicit current tool configuration', async () => {
    const agentInput = {
      key: 'legacy',
      label: 'Legacy',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      defaultToAgentGenerated: true
    };
    const explicitManualInput = {
      key: 'manual',
      label: 'Manual',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.input,
      defaultToAgentGenerated: false
    };
    const nodes = [
      {
        nodeId: 'plugin-input',
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        inputs: [agentInput, explicitManualInput],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      defaultToAgentGenerated: true,
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    });
    expect(nodes[0].inputs[1]).toMatchObject({
      defaultToAgentGenerated: false,
      selectedType: FlowNodeInputTypeEnum.input
    });
  });

  it('hydrates a fixed-version workflow tool without changing its selected mode', async () => {
    const toolAppId = '507f1f77bcf86cd799439011';
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: toolAppId,
      pluginId: toolAppId,
      flowNodeType: FlowNodeTypeEnum.pluginModule,
      name: 'Workflow tool',
      avatar: '',
      intro: '',
      inputs: [],
      outputs: [],
      version: 'legacy-version-id',
      versionLabel: '2026-07-24 14:16:01',
      isLatestVersion: false
    });
    authAppByTmbIdMock.mockResolvedValue({});

    const nodes = [
      {
        nodeId: 'legacy-workflow-tool',
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        pluginId: toolAppId,
        version: 'legacy-version-id',
        inputs: [
          {
            key: 'text',
            label: 'text',
            valueType: WorkflowIOValueTypeEnum.string,
            required: true,
            value: '',
            selectedType: FlowNodeInputTypeEnum.input,
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
          },
          {
            key: 'text2',
            label: 'text2',
            valueType: WorkflowIOValueTypeEnum.string,
            value: '',
            selectedType: FlowNodeInputTypeEnum.input,
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      key: 'text',
      selectedType: FlowNodeInputTypeEnum.input
    });
    expect(nodes[0].inputs[1]).toMatchObject({
      key: 'text2',
      selectedType: FlowNodeInputTypeEnum.input,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.input,
        FlowNodeInputTypeEnum.reference
      ]
    });
  });

  it('将已有节点保存的外部变量类型投影为父工作流可配置输入', async () => {
    const toolAppId = '507f1f77bcf86cd799439011';
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: toolAppId,
      pluginId: toolAppId,
      flowNodeType: FlowNodeTypeEnum.pluginModule,
      name: 'Workflow tool',
      avatar: '',
      intro: '',
      inputs: [
        {
          key: 'externalVariable',
          label: 'External variable',
          valueType: WorkflowIOValueTypeEnum.string,
          defaultValue: 'fallback',
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
          selectedType: FlowNodeInputTypeEnum.reference
        }
      ],
      outputs: [],
      version: '',
      isLatestVersion: true
    });
    authAppByTmbIdMock.mockResolvedValue({});
    const nodes = [
      {
        nodeId: 'workflow-tool',
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        pluginId: toolAppId,
        version: '',
        inputs: [
          {
            key: 'externalVariable',
            label: 'External variable',
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'saved-value',
            renderTypeList: [FlowNodeInputTypeEnum.customVariable],
            selectedType: FlowNodeInputTypeEnum.customVariable
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      value: 'saved-value',
      defaultValue: 'fallback',
      canAgentGenerated: true,
      defaultToAgentGenerated: true,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.input
      ],
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    });
  });

  it.each([FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input])(
    '投影外部变量时保留旧节点显式选择的 %s 类型',
    async (selectedType) => {
      const toolAppId = '507f1f77bcf86cd799439011';
      getClientToolPreviewNodeMock.mockResolvedValue({
        id: toolAppId,
        pluginId: toolAppId,
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        name: 'Workflow tool',
        avatar: '',
        intro: '',
        inputs: [
          {
            key: 'externalVariable',
            label: 'External variable',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.customVariable]
          }
        ],
        outputs: [],
        version: '',
        isLatestVersion: true
      });
      authAppByTmbIdMock.mockResolvedValue({});
      const nodes = [
        {
          nodeId: 'workflow-tool',
          flowNodeType: FlowNodeTypeEnum.pluginModule,
          pluginId: toolAppId,
          version: '',
          inputs: [
            {
              key: 'externalVariable',
              label: 'External variable',
              valueType: WorkflowIOValueTypeEnum.string,
              value:
                selectedType === FlowNodeInputTypeEnum.reference
                  ? ['workflowStart', 'userChatInput']
                  : 'fixed value',
              renderTypeList: [
                FlowNodeInputTypeEnum.customVariable,
                FlowNodeInputTypeEnum.reference,
                FlowNodeInputTypeEnum.input
              ],
              selectedType
            }
          ],
          outputs: []
        } as StoreNodeItemType
      ];

      await rewriteAppWorkflowToDetail({
        nodes,
        teamId: 'team-1',
        ownerTmbId: 'tmb-1',
        isRoot: false
      });

      expect(nodes[0].inputs[0]).toMatchObject({
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.reference,
          FlowNodeInputTypeEnum.input
        ],
        selectedType
      });
    }
  );

  it.each([
    ['工作流工具', FlowNodeTypeEnum.pluginModule],
    ['嵌套工作流', FlowNodeTypeEnum.appModule]
  ])('将固定版本%s保存的外部变量投影为父工作流可配置输入', async (_, flowNodeType) => {
    const toolAppId = '507f1f77bcf86cd799439012';
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: toolAppId,
      pluginId: toolAppId,
      flowNodeType,
      name: 'Fixed workflow',
      avatar: '',
      intro: '',
      inputs: [],
      outputs: [],
      version: 'fixed-version-id',
      isLatestVersion: false
    });
    authAppByTmbIdMock.mockResolvedValue({});
    const nodes = [
      {
        nodeId: 'fixed-workflow',
        flowNodeType,
        pluginId: toolAppId,
        version: 'fixed-version-id',
        inputs: [
          {
            key: 'externalVariable',
            label: 'External variable',
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'saved-value',
            renderTypeList: [FlowNodeInputTypeEnum.customVariable],
            selectedType: FlowNodeInputTypeEnum.customVariable
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      value: 'saved-value',
      canAgentGenerated: true,
      defaultToAgentGenerated: true,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.input
      ],
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    });
  });

  it('hydrates a fixed-version system tool without changing its selected mode', async () => {
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: 'systemTool-bocha',
      pluginId: 'systemTool-bocha',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'System tool',
      avatar: '',
      intro: '',
      inputs: [],
      outputs: [],
      version: '0.1.1',
      versionLabel: '0.1.1',
      isLatestVersion: false
    });

    const nodes = [
      {
        nodeId: 'legacy-system-tool',
        flowNodeType: FlowNodeTypeEnum.tool,
        pluginId: 'systemTool-bocha',
        version: '0.1.1',
        inputs: [
          {
            key: 'query',
            label: 'query',
            valueType: WorkflowIOValueTypeEnum.string,
            required: true,
            value: '',
            selectedType: FlowNodeInputTypeEnum.input,
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      key: 'query',
      selectedType: FlowNodeInputTypeEnum.input
    });
  });
});

describe('rewriteAppWorkflowToDetail - tool call inputs', () => {
  it('保留候选类型并由画布按工具上下文处理用户问题', async () => {
    const userQuestion = {
      key: NodeInputKeyEnum.userChatInput,
      label: 'User question',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.textarea
      ],
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    };
    const nodes = [
      {
        nodeId: 'tool-call',
        flowNodeType: FlowNodeTypeEnum.toolCall,
        inputs: [userQuestion],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.textarea
      ]
    });
  });
});

describe('rewriteAppWorkflowToDetail - agent skills', () => {
  beforeEach(() => {
    getClientToolPreviewNodeMock.mockReset();
    authAppByTmbIdMock.mockReset();
  });

  it('在 app detail 改写阶段标记已删除 Skill，并刷新可用 Skill 的快照信息', async () => {
    const user = await getUser(`agent-skill-detail-${getNanoid(6)}`);
    const [activeSkill, deletedSkill] = await MongoAgentSkills.create([
      {
        name: 'Current Skill Name',
        description: 'Current skill description',
        avatar: 'current-avatar',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId
      },
      {
        name: 'Deleted Skill Name',
        description: 'Deleted skill description',
        type: AgentSkillTypeEnum.skill,
        source: AgentSkillSourceEnum.personal,
        teamId: user.teamId,
        tmbId: user.tmbId,
        deleteTime: new Date()
      }
    ]);
    const skillsInput = {
      key: NodeInputKeyEnum.skills,
      value: [
        {
          skillId: String(activeSkill._id)
        },
        {
          skillId: String(deletedSkill._id),
          name: 'Deleted Snapshot',
          description: 'Deleted snapshot description'
        }
      ]
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: []
          },
          skillsInput
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: user.teamId,
      ownerTmbId: user.tmbId,
      isRoot: false,
      resources: [{ type: 'skill', id: String(activeSkill._id) }]
    });

    const rewrittenSkills = nodes[0].inputs.find((input) => input.key === NodeInputKeyEnum.skills)
      ?.value as SelectedAgentSkillItemType[];

    expect(rewrittenSkills).toEqual([
      {
        skillId: String(activeSkill._id),
        name: 'Current Skill Name',
        description: 'Current skill description',
        avatar: 'current-avatar',
        isDeleted: false,
        permissionDenied: false
      },
      {
        skillId: String(deletedSkill._id),
        name: 'Deleted Snapshot',
        description: 'Deleted snapshot description',
        avatar: undefined,
        isDeleted: true,
        permissionDenied: false
      }
    ]);
  });

  it('刷新最新工具节点时保留旧节点选中的引用类型', async () => {
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: 'mcp-app-1/tool',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Tool',
      avatar: 'new-avatar',
      intro: '',
      inputs: [
        {
          key: 'size',
          label: 'Size',
          valueType: WorkflowIOValueTypeEnum.number,
          value: '1',
          renderTypeList: [FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.reference],
          list: [
            { label: '1', value: '1' },
            { label: '2', value: '2' }
          ]
        }
      ],
      outputs: [
        {
          id: 'rawResponse',
          key: 'rawResponse',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.any
        }
      ],
      version: '',
      versionLabel: 'latest',
      isLatestVersion: true
    });
    authAppByTmbIdMock.mockResolvedValue({});

    const nodes = [
      {
        nodeId: 'tool',
        flowNodeType: FlowNodeTypeEnum.tool,
        pluginId: 'mcp-app-1/tool',
        inputs: [
          {
            key: 'size',
            label: 'Size',
            valueType: WorkflowIOValueTypeEnum.number,
            value: ['start', 'amount'],
            selectedType: FlowNodeInputTypeEnum.reference,
            renderTypeList: [FlowNodeInputTypeEnum.reference]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      key: 'size',
      value: ['start', 'amount'],
      selectedType: FlowNodeInputTypeEnum.reference,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.select
      ],
      list: [
        { label: '1', value: '1' },
        { label: '2', value: '2' }
      ]
    });
  });

  it('刷新最新工具节点时保留 agentGenerated 推荐并显式保存手动类型', async () => {
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: 'mcp-app-1/search',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Search Tool',
      avatar: 'new-avatar',
      intro: '',
      inputs: [
        {
          key: 'query',
          label: 'Query',
          valueType: WorkflowIOValueTypeEnum.string,
          value: '',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          defaultToAgentGenerated: true,
          toolDescription: 'Search query'
        }
      ],
      outputs: [],
      version: '',
      versionLabel: 'latest',
      isLatestVersion: true
    });
    authAppByTmbIdMock.mockResolvedValue({});

    const nodes = [
      {
        nodeId: 'tool',
        flowNodeType: FlowNodeTypeEnum.tool,
        pluginId: 'mcp-app-1/search',
        inputs: [
          {
            key: 'query',
            label: 'Query',
            valueType: WorkflowIOValueTypeEnum.string,
            value: 'legacy value',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      key: 'query',
      value: 'legacy value',
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.input,
        FlowNodeInputTypeEnum.reference
      ],
      defaultToAgentGenerated: true,
      toolDescription: 'Search query'
    });
    expect(nodes[0].inputs[0].selectedType).toBe(FlowNodeInputTypeEnum.input);
  });

  it('刷新最新工具节点时保留当前 selectedType', async () => {
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: 'mcp-app-1/search',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Search Tool',
      avatar: 'new-avatar',
      intro: '',
      inputs: [
        {
          key: 'query',
          label: 'Query',
          valueType: WorkflowIOValueTypeEnum.string,
          value: '',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          defaultToAgentGenerated: true,
          toolDescription: 'Search query'
        }
      ],
      outputs: [],
      version: '',
      versionLabel: 'latest',
      isLatestVersion: true
    });
    authAppByTmbIdMock.mockResolvedValue({});

    const nodes = [
      {
        nodeId: 'tool',
        flowNodeType: FlowNodeTypeEnum.tool,
        pluginId: 'mcp-app-1/search',
        inputs: [
          {
            key: 'query',
            label: 'Query',
            valueType: WorkflowIOValueTypeEnum.string,
            value: '',
            selectedType: FlowNodeInputTypeEnum.input,
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0]).toMatchObject({
      key: 'query',
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.input,
        FlowNodeInputTypeEnum.reference
      ]
    });
    expect(nodes[0].inputs[0].selectedType).toBe(FlowNodeInputTypeEnum.input);
  });

  it('保留 Agent 工具和 Skill 输入的引用模式值，不按选择列表重写', async () => {
    const toolReferenceValue = ['source-node', 'tools'];
    const skillReferenceValue = ['source-node', 'skills'];
    const toolInput = {
      key: NodeInputKeyEnum.selectedTools,
      renderTypeList: [FlowNodeInputTypeEnum.selectTool, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference,
      value: toolReferenceValue
    };
    const skillsInput = {
      key: NodeInputKeyEnum.skills,
      renderTypeList: [FlowNodeInputTypeEnum.selectSkill, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference,
      value: skillReferenceValue
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [toolInput, skillsInput],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(toolInput.value).toEqual(toolReferenceValue);
    expect(skillsInput.value).toEqual(skillReferenceValue);
    expect(getClientToolPreviewNodeMock).not.toHaveBeenCalled();
  });

  it('校验嵌套工具权限时透传 root 身份', async () => {
    const toolAppId = '507f1f77bcf86cd799439011';
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: toolAppId,
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Personal Tool',
      avatar: '',
      intro: '',
      inputs: [],
      outputs: [],
      version: 'v1'
    });
    authAppByTmbIdMock.mockResolvedValue({});

    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [
              {
                id: toolAppId,
                config: {}
              }
            ]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: true
    });

    expect(authAppByTmbIdMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tmbId: 'tmb-1',
        appId: toolAppId,
        isRoot: true
      })
    );
  });

  it('保留有效 Agent 工具，不因单个缺少 config 清空工具列表', async () => {
    const validToolId = '507f1f77bcf86cd799439014';
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: validToolId,
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Valid tool',
      avatar: '',
      intro: '',
      inputs: [],
      outputs: [],
      version: 'v1'
    });
    authAppByTmbIdMock.mockResolvedValue({});

    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [{ id: 'invalid-tool' }, { id: validToolId, config: {} }]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(nodes[0].inputs[0].value).toMatchObject([expect.objectContaining({ id: validToolId })]);
  });

  it('刷新 Agent 工具时保留已保存的 input selectedType 配置', async () => {
    const toolAppId = '507f1f77bcf86cd799439012';
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: toolAppId,
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Personal Tool',
      avatar: '',
      intro: '',
      inputs: [
        {
          key: 'query',
          label: 'Query',
          valueType: WorkflowIOValueTypeEnum.string,
          value: '',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          defaultToAgentGenerated: true,
          toolDescription: 'Query'
        }
      ],
      outputs: [],
      version: 'v1'
    });
    authAppByTmbIdMock.mockResolvedValue({});

    const toolInput = {
      key: NodeInputKeyEnum.selectedTools,
      value: [
        {
          id: toolAppId,
          inputs: [
            {
              key: 'query',
              mode: 'manual'
            }
          ],
          config: {
            query: 'manual value'
          }
        }
      ]
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [toolInput],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(
      nodes[0].inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)?.value
    ).toMatchObject([
      {
        inputs: [
          {
            key: 'query',
            value: 'manual value',
            renderTypeList: [
              FlowNodeInputTypeEnum.agentGenerated,
              FlowNodeInputTypeEnum.input,
              FlowNodeInputTypeEnum.reference
            ],
            selectedType: FlowNodeInputTypeEnum.input
          }
        ]
      }
    ]);
  });

  it('刷新 Agent 中的旧工作流工具时恢复 toolDescription 对应的 AI 生成类型', async () => {
    const toolAppId = '507f1f77bcf86cd799439013';
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: toolAppId,
      flowNodeType: FlowNodeTypeEnum.pluginModule,
      name: 'Legacy workflow tool',
      avatar: '',
      intro: '',
      inputs: [
        {
          key: 'text',
          label: 'text',
          valueType: WorkflowIOValueTypeEnum.string,
          required: true,
          value: '',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          toolDescription: 'text'
        }
      ],
      outputs: [],
      version: 'v1'
    });
    authAppByTmbIdMock.mockResolvedValue({});

    const toolInput = {
      key: NodeInputKeyEnum.selectedTools,
      value: [
        {
          id: toolAppId,
          config: {}
        }
      ]
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [toolInput],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(
      nodes[0].inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)?.value
    ).toMatchObject([
      {
        inputs: [
          {
            key: 'text',
            selectedType: FlowNodeInputTypeEnum.agentGenerated,
            renderTypeList: [
              FlowNodeInputTypeEnum.agentGenerated,
              FlowNodeInputTypeEnum.input,
              FlowNodeInputTypeEnum.reference
            ]
          }
        ]
      }
    ]);
  });

  it('刷新 Agent 中的旧系统工具时保留 toolDescription AI 参数兼容', async () => {
    getClientToolPreviewNodeMock.mockResolvedValue({
      id: 'systemTool-bocha',
      flowNodeType: FlowNodeTypeEnum.tool,
      name: 'Legacy system tool',
      avatar: '',
      intro: '',
      inputs: [
        {
          key: 'query',
          label: 'query',
          valueType: WorkflowIOValueTypeEnum.string,
          required: true,
          value: '',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          defaultToAgentGenerated: false,
          toolDescription: 'Search query'
        }
      ],
      outputs: [],
      version: '0.1.1'
    });

    const toolInput = {
      key: NodeInputKeyEnum.selectedTools,
      value: [
        {
          id: 'systemTool-bocha',
          config: {}
        }
      ]
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [toolInput],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false
    });

    expect(
      nodes[0].inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)?.value
    ).toMatchObject([
      {
        inputs: [
          {
            key: 'query',
            selectedType: FlowNodeInputTypeEnum.agentGenerated,
            renderTypeList: [
              FlowNodeInputTypeEnum.agentGenerated,
              FlowNodeInputTypeEnum.input,
              FlowNodeInputTypeEnum.reference
            ]
          }
        ]
      }
    ]);
  });

  it('按当前语言展示调试工具 metadata 缺失错误', async () => {
    getClientToolPreviewNodeMock.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: 'Debug plugin metadata not found: debug:tmbId:tmb-1',
            reason: {
              en: 'Debug plugin metadata not found: debug:tmbId:tmb-1',
              'zh-CN': '调试插件元数据不存在: debug:tmbId:tmb-1'
            }
          }
        }
      }
    });

    const toolInput = {
      key: NodeInputKeyEnum.selectedTools,
      value: [
        {
          id: 'systemTool-weather',
          source: 'debug:tmbId:tmb-1',
          config: {}
        }
      ]
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [toolInput],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: 'team-1',
      ownerTmbId: 'tmb-1',
      isRoot: false,
      lang: 'zh-CN'
    });

    expect(
      nodes[0].inputs.find((input) => input.key === NodeInputKeyEnum.selectedTools)?.value
    ).toMatchObject([
      {
        pluginData: {
          error: '调试插件元数据不存在: debug:tmbId:tmb-1'
        },
        configStatus: 'invalid'
      }
    ]);
  });

  it('保留 Agent 知识库选择输入的引用模式值，不按知识库列表重写', async () => {
    const user = await getUser(`agent-dataset-reference-${getNanoid(6)}`);
    const dataset = await MongoDataset.create({
      name: 'Reference Trigger Dataset',
      vectorModel: 'text-embedding-3-small',
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    const referenceValue = ['source-node', 'datasets'];
    const datasetSelectInput = {
      key: NodeInputKeyEnum.datasetSelectList,
      renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference,
      value: referenceValue
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: []
          },
          datasetSelectInput,
          {
            key: NodeInputKeyEnum.datasetParams,
            value: {
              datasets: [
                {
                  datasetId: String(dataset._id),
                  avatar: 'old-avatar',
                  name: 'Old Name',
                  vectorModel: {
                    model: 'old-model'
                  }
                }
              ]
            }
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: user.teamId,
      ownerTmbId: user.tmbId,
      isRoot: false,
      resources: [{ type: 'dataset', id: String(dataset._id) }]
    });

    expect(datasetSelectInput.value).toEqual(referenceValue);
  });

  it('刷新 ChatAgent 的知识库参数快照信息', async () => {
    const user = await getUser(`agent-dataset-params-${getNanoid(6)}`);
    const embeddingModel = global.systemDefaultModel.embedding;
    const dataset = await MongoDataset.create({
      name: 'Current Dataset Name',
      avatar: '/icon/current-dataset.svg',
      vectorModelId: embeddingModel.modelId,
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    const resolvedEmbeddingModel = getDatasetEmbeddingModel(dataset);
    const datasetParamsInput = {
      key: NodeInputKeyEnum.datasetParams,
      value: {
        datasets: [
          {
            datasetId: String(dataset._id),
            avatar: 'old-avatar',
            name: 'Old Dataset Name',
            vectorModel: {
              model: 'old-model'
            }
          }
        ]
      }
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: []
          },
          datasetParamsInput
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: user.teamId,
      ownerTmbId: user.tmbId,
      isRoot: false,
      resources: [{ type: 'dataset', id: String(dataset._id) }]
    });

    const rewrittenDatasetParams = nodes[0].inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetParams
    )?.value as AppFormEditFormType['dataset'];

    expect(rewrittenDatasetParams.datasets).toEqual([
      {
        datasetId: String(dataset._id),
        name: 'Current Dataset Name',
        avatar: '/icon/current-dataset.svg',
        vectorModel: expect.objectContaining({
          modelId: resolvedEmbeddingModel.modelId,
          model: resolvedEmbeddingModel.model
        }),
        isDeleted: false,
        permissionDenied: false
      }
    ]);
  });

  it('兼容旧版单对象知识库选择项并补齐详情快照', async () => {
    const user = await getUser(`legacy-single-dataset-detail-${getNanoid(6)}`);
    const embeddingModel = global.systemDefaultModel.embedding;
    const dataset = await MongoDataset.create({
      name: 'Legacy Dataset Name',
      avatar: '/icon/legacy-dataset.svg',
      vectorModelId: embeddingModel.modelId,
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    const resolvedEmbeddingModel = getDatasetEmbeddingModel(dataset);
    const datasetSelectInput = {
      key: NodeInputKeyEnum.datasetSelectList,
      value: {
        datasetId: String(dataset._id)
      }
    };
    const nodes = [
      {
        nodeId: 'dataset-search',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [datasetSelectInput],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: user.teamId,
      ownerTmbId: user.tmbId,
      isRoot: false,
      resources: [{ type: 'dataset', id: String(dataset._id) }]
    });

    expect(
      nodes[0].inputs.find((input) => input.key === NodeInputKeyEnum.datasetSelectList)?.value
    ).toEqual([
      {
        datasetId: String(dataset._id),
        name: 'Legacy Dataset Name',
        avatar: '/icon/legacy-dataset.svg',
        vectorModel: expect.objectContaining({
          modelId: resolvedEmbeddingModel.modelId,
          model: resolvedEmbeddingModel.model
        }),
        isDeleted: false,
        permissionDenied: false
      }
    ]);
  });

  it('已删除知识库在 app detail 改写阶段使用通用知识库默认头像', async () => {
    const user = await getUser(`deleted-dataset-detail-${getNanoid(6)}`);
    const deletedDataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      type: DatasetTypeEnum.dataset,
      name: 'Deleted Dataset',
      avatar: '/icon/logo.svg',
      vectorModel: 'text-embedding-3-small',
      agentModel: 'gpt-4o-mini',
      deleteTime: new Date()
    });
    const deletedDatasetId = String(deletedDataset._id);
    const datasetSelectInput = {
      key: NodeInputKeyEnum.datasetSelectList,
      value: [
        {
          datasetId: deletedDatasetId,
          name: 'Deleted Dataset Snapshot',
          avatar: '/icon/logo.svg',
          vectorModel: {
            model: 'text-embedding-3-small'
          }
        }
      ]
    };
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: []
          },
          datasetSelectInput
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: user.teamId,
      ownerTmbId: user.tmbId,
      isRoot: false
    });

    expect(
      nodes[0].inputs.find((input) => input.key === NodeInputKeyEnum.datasetSelectList)?.value
    ).toEqual([
      {
        datasetId: deletedDatasetId,
        name: 'Deleted Dataset Snapshot',
        avatar: DatasetTypeMap[DatasetTypeEnum.dataset].avatar,
        vectorModel: {
          model: 'text-embedding-3-small'
        },
        isDeleted: true
      }
    ]);
  });

  it('缺失知识库在 app detail 改写阶段保留合法快照并标记删除态', async () => {
    const user = await getUser(`missing-dataset-detail-${getNanoid(6)}`);
    const missingDataset = await MongoDataset.create({
      name: 'Missing Dataset',
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    const missingDatasetId = String(missingDataset._id);
    await MongoDataset.deleteOne({ _id: missingDataset._id });
    const datasetSelectInput = {
      key: NodeInputKeyEnum.datasetSelectList,
      value: [
        {
          datasetId: missingDatasetId,
          name: 'Missing Dataset Snapshot',
          avatar: '/icon/snapshot.svg',
          vectorModel: {
            model: 'text-embedding-3-small'
          }
        }
      ]
    };
    const nodes = [
      {
        nodeId: 'dataset-search',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [datasetSelectInput],
        outputs: []
      } as StoreNodeItemType
    ];

    await rewriteAppWorkflowToDetail({
      nodes,
      teamId: user.teamId,
      ownerTmbId: user.tmbId,
      isRoot: false
    });

    expect(
      nodes[0].inputs.find((input) => input.key === NodeInputKeyEnum.datasetSelectList)?.value
    ).toEqual([
      {
        datasetId: missingDatasetId,
        name: 'Missing Dataset Snapshot',
        avatar: DatasetTypeMap[DatasetTypeEnum.dataset].avatar,
        vectorModel: {
          model: 'text-embedding-3-small'
        },
        isDeleted: true
      }
    ]);
  });
});
