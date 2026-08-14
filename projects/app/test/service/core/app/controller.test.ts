import { describe, expect, it, vi } from 'vitest';
import {
  beforeUpdateAppFormat,
  prepareWorkflowForPersistence,
  prepareWorkflowForRead,
  validatePublishAppAgentSkillReadPermissions
} from '@fastgpt/service/core/app/controller';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';

const mocks = vi.hoisted(() => ({
  getClientToolPreviewNode: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/utils/client', () => mocks);

describe('workflow preparation boundaries', () => {
  const legacyWorkflow = {
    nodes: [
      {
        nodeId: 'system',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        name: 'System',
        inputs: [
          {
            key: NodeInputKeyEnum.welcomeText,
            label: 'Welcome',
            value: 'Hello',
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ],
        outputs: []
      },
      {
        nodeId: 'start',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        name: 'Start',
        inputs: [
          {
            key: 'query',
            label: 'Query',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
            selectedTypeIndex: 1
          }
        ],
        outputs: []
      }
    ],
    edges: [
      {
        source: 'system',
        sourceHandle: 'system-source',
        target: 'start',
        targetHandle: 'start-target'
      }
    ]
  } as any;

  it('迁移读取数据并移除所有已消费的 Legacy 字段', () => {
    const workflow = prepareWorkflowForRead(legacyWorkflow);

    expect(workflow.nodes).toHaveLength(1);
    expect(workflow.edges).toEqual([]);
    expect(workflow.chatConfig?.welcomeText).toBe('Hello');
    expect(workflow.nodes[0].inputs[0]).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.reference
    });
    expect(workflow.nodes[0].inputs[0]).not.toHaveProperty('selectedTypeIndex');
  });

  it('持久化准备在迁移后返回独立的 canonical workflow', async () => {
    const workflow = await prepareWorkflowForPersistence(legacyWorkflow);

    expect(workflow).toEqual(prepareWorkflowForRead(legacyWorkflow));
    expect(legacyWorkflow.nodes).toHaveLength(2);
  });
});

describe('beforeUpdateAppFormat', () => {
  it.each([SystemToolSecretInputTypeEnum.system, SystemToolSecretInputTypeEnum.team])(
    '保存前清理 %s 类型中的临时密钥值',
    async (type) => {
      const nodes = [
        {
          inputs: [
            {
              key: NodeInputKeyEnum.systemInputConfig,
              value: {
                type,
                value: {
                  apiKey: {
                    value: 'temporary-secret',
                    secret: ''
                  }
                }
              },
              inputList: [{ key: 'apiKey', inputType: 'secret' }]
            }
          ]
        } as StoreNodeItemType
      ];

      await beforeUpdateAppFormat({ nodes, teamId: 'team-1' });

      expect(nodes[0].inputs[0].value).toEqual({ type });
    }
  );

  it('即使系统输入被标记为引用，也不能保留临时密钥值', async () => {
    const nodes = [
      {
        inputs: [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            selectedType: FlowNodeInputTypeEnum.reference,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            value: {
              type: SystemToolSecretInputTypeEnum.system,
              value: {
                apiKey: {
                  value: 'temporary-secret',
                  secret: ''
                }
              }
            },
            inputList: [{ key: 'apiKey', inputType: 'secret' }]
          }
        ]
      } as StoreNodeItemType
    ];

    await beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual({
      type: SystemToolSecretInputTypeEnum.system
    });
  });

  it('保存前仅加密 manual 类型的临时密钥值', async () => {
    const nodes = [
      {
        inputs: [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            value: {
              type: SystemToolSecretInputTypeEnum.manual,
              value: {
                apiKey: {
                  value: 'temporary-secret',
                  secret: ''
                },
                region: 'cn'
              }
            },
            inputList: [
              { key: 'apiKey', inputType: 'secret' },
              { key: 'region', inputType: 'input' }
            ]
          }
        ]
      } as StoreNodeItemType
    ];

    await beforeUpdateAppFormat({ nodes });

    const value = nodes[0].inputs[0].value as any;
    expect(value.type).toBe(SystemToolSecretInputTypeEnum.manual);
    expect(value.value.apiKey.value).toBe('');
    expect(value.value.apiKey.secret).toEqual(expect.any(String));
    expect(value.value.region).toBe('cn');
  });

  it('保存 Agent 嵌套工具配置前加密手动密钥', async () => {
    mocks.getClientToolPreviewNode.mockResolvedValueOnce({
      inputs: [
        {
          key: NodeInputKeyEnum.systemInputConfig,
          inputList: [{ key: 'apiKey', inputType: 'secret' }]
        }
      ]
    });
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [
              {
                id: 'system-tool',
                config: {
                  system_input_config: {
                    type: SystemToolSecretInputTypeEnum.manual,
                    value: {
                      apiKey: { value: 'nested-secret', secret: '' }
                    }
                  }
                }
              }
            ]
          }
        ]
      }
    ] as StoreNodeItemType[];

    await beforeUpdateAppFormat({ nodes, teamId: 'team-1' });

    const config = (nodes[0].inputs[0].value as any)[0].config;
    expect(config.system_input_config.value.apiKey.value).toBe('');
    expect(config.system_input_config.value.apiKey.secret).toEqual(expect.any(String));
  });

  it('保存 Agent 嵌套团队工具配置时把 teamId 传给预览接口', async () => {
    mocks.getClientToolPreviewNode.mockResolvedValueOnce({ inputs: [] });
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [
              {
                id: 'systemTool-weather',
                source: 'teamId:team-1',
                config: {}
              }
            ]
          }
        ]
      }
    ] as StoreNodeItemType[];

    await beforeUpdateAppFormat({ nodes, teamId: 'team-1' });

    expect(mocks.getClientToolPreviewNode).toHaveBeenCalledWith({
      appId: 'systemTool-weather',
      versionId: undefined,
      source: 'teamId:team-1',
      teamId: 'team-1'
    });
  });

  it('保存前统一压缩知识库选择项，去掉编辑态删除标记和快照字段', async () => {
    const nodes = [
      {
        nodeId: 'dataset-node',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        name: 'Dataset',
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            label: 'Datasets',
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.selectDataset,
            value: [
              {
                datasetId: 'dataset-1',
                avatar: 'avatar.png',
                name: 'Deleted Dataset',
                vectorModel: {
                  model: 'text-embedding'
                },
                isDeleted: true
              }
            ]
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    await beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual([
      {
        datasetId: 'dataset-1'
      }
    ]);
  });

  it('保存前兼容旧版单对象知识库选择项', async () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.selectDataset,
            value: {
              datasetId: 'dataset-legacy',
              avatar: 'avatar.png',
              name: 'Legacy Dataset',
              vectorModel: {
                model: 'text-embedding'
              }
            }
          }
        ]
      } as StoreNodeItemType
    ];

    await beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual([
      {
        datasetId: 'dataset-legacy'
      }
    ]);
  });

  it('保存前兼容已压缩的知识库选择项数组', async () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.selectDataset,
            value: [
              {
                datasetId: 'dataset-1'
              },
              {
                datasetId: 'dataset-2'
              }
            ]
          }
        ]
      } as StoreNodeItemType
    ];

    await beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual([
      {
        datasetId: 'dataset-1'
      },
      {
        datasetId: 'dataset-2'
      }
    ]);
  });

  it('保存前统一压缩 Agent datasetParams 中的知识库选择项', async () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetParams,
            value: {
              datasets: [
                {
                  datasetId: 'dataset-1',
                  avatar: 'avatar.png',
                  name: 'Deleted Dataset',
                  vectorModel: {
                    model: 'text-embedding'
                  },
                  isDeleted: true
                }
              ],
              similarity: 0.5,
              limit: 5
            }
          }
        ]
      } as StoreNodeItemType
    ];

    await beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toMatchObject({
      datasets: [
        {
          datasetId: 'dataset-1'
        }
      ],
      similarity: 0.5,
      limit: 5
    });
  });

  it('保存前保留知识库选择输入的引用模式值', async () => {
    const referenceValue = ['sourceNode', 'datasets'];
    const nodes = [
      {
        nodeId: 'dataset-node',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        name: 'Dataset',
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            label: 'Datasets',
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference,
            value: referenceValue
          }
        ],
        outputs: []
      } as StoreNodeItemType
    ];

    const workflow = prepareWorkflowForRead({ nodes, edges: [] });
    await beforeUpdateAppFormat({ nodes: workflow.nodes });

    expect(workflow.nodes[0].inputs[0].value).toBe(referenceValue);
  });

  it('允许保存尚未选择知识库的工作流草稿', async () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.selectDataset,
            value: undefined
          }
        ]
      } as StoreNodeItemType
    ];

    await beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual([]);
  });

  it('保存前遇到非法知识库选择项时抛错，避免清空后继续保存', async () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.selectDataset,
            value: [
              {
                name: 'Invalid Dataset'
              }
            ]
          }
        ]
      } as StoreNodeItemType
    ];

    await expect(beforeUpdateAppFormat({ nodes, teamId: 'team-1' })).rejects.toThrow();
  });

  it('保存前移除 Agent Skill 的编辑态删除标记和展示快照字段', async () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.skills,
            renderTypeList: [FlowNodeInputTypeEnum.selectSkill, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.selectSkill,
            value: [
              {
                skillId: 'skill-1',
                name: 'Deleted Skill',
                description: 'Snapshot description',
                avatar: 'skill-avatar.png',
                isDeleted: true
              },
              {
                skillId: 'skill-2',
                name: 'Normal Skill',
                description: '',
                isDeleted: false
              }
            ]
          }
        ]
      } as StoreNodeItemType
    ];

    await beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual([
      {
        skillId: 'skill-1'
      },
      {
        skillId: 'skill-2'
      }
    ]);
  });
});

describe('validatePublishAppAgentSkillReadPermissions', () => {
  it('发布应用时校验静态绑定的 Agent Skill 读权限', async () => {
    const owner = await getUser(`publish-skill-owner-${getNanoid(6)}`);
    const member = await getUser(`publish-skill-member-${getNanoid(6)}`, owner.teamId);
    const skill = await MongoAgentSkills.create({
      name: 'Protected Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.skills,
            value: [
              {
                skillId: String(skill._id)
              }
            ]
          }
        ]
      } as StoreNodeItemType
    ];

    await expect(
      validatePublishAppAgentSkillReadPermissions({
        nodes,
        tmbId: member.tmbId
      })
    ).rejects.toBe(SkillErrEnum.unAuthSkill);

    await expect(
      validatePublishAppAgentSkillReadPermissions({
        nodes,
        tmbId: owner.tmbId
      })
    ).resolves.toBeUndefined();
  });
});
