import { describe, expect, it, vi } from 'vitest';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { extractAppResources } from '@fastgpt/service/core/app/resources';
import {
  checkAppResourceReadPermissions,
  resolveAppResourcesByPermission
} from '@fastgpt/service/support/permission/app/resource';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';

const mocks = vi.hoisted(() => ({
  getClientToolPreviewNode: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/utils/client', () => mocks);

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

    await beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toBe(referenceValue);
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

describe('checkAppResourceReadPermissions', () => {
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
      checkAppResourceReadPermissions({
        resources: extractAppResources({ nodes }),
        tmbId: member.tmbId
      })
    ).rejects.toBe(SkillErrEnum.unAuthSkill);

    await expect(
      checkAppResourceReadPermissions({
        resources: extractAppResources({ nodes }),
        tmbId: owner.tmbId
      })
    ).resolves.toBeUndefined();
  });

  it('缺失 inheritPermission 的历史 App 和 Dataset 继续继承父级读权限', async () => {
    const owner = await getUser(`legacy-inherit-owner-${getNanoid(6)}`);
    const member = await getUser(`legacy-inherit-member-${getNanoid(6)}`, owner.teamId);
    const [appFolder, datasetFolder] = await Promise.all([
      MongoApp.create({
        name: 'App folder',
        type: AppTypeEnum.folder,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      }),
      MongoDataset.create({
        name: 'Dataset folder',
        type: DatasetTypeEnum.folder,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      })
    ]);
    const childAppId = new Types.ObjectId();
    const childDatasetId = new Types.ObjectId();

    // 绕过 Schema 默认值，模拟升级前未写 inheritPermission 的历史数据。
    await Promise.all([
      MongoApp.collection.insertOne({
        _id: childAppId,
        name: 'Legacy child app',
        type: AppTypeEnum.workflow,
        parentId: appFolder._id,
        teamId: new Types.ObjectId(owner.teamId),
        tmbId: new Types.ObjectId(owner.tmbId)
      }),
      MongoDataset.collection.insertOne({
        _id: childDatasetId,
        name: 'Legacy child dataset',
        type: DatasetTypeEnum.dataset,
        parentId: datasetFolder._id,
        teamId: new Types.ObjectId(owner.teamId),
        tmbId: new Types.ObjectId(owner.tmbId)
      }),
      MongoResourcePermission.create([
        {
          resourceType: PerResourceTypeEnum.app,
          resourceId: appFolder._id,
          teamId: owner.teamId,
          tmbId: member.tmbId,
          permission: ReadPermissionVal
        },
        {
          resourceType: PerResourceTypeEnum.dataset,
          resourceId: datasetFolder._id,
          teamId: owner.teamId,
          tmbId: member.tmbId,
          permission: ReadPermissionVal
        }
      ])
    ]);

    await expect(
      checkAppResourceReadPermissions({
        resources: [
          { type: 'agent', id: String(childAppId) },
          { type: 'dataset', id: String(childDatasetId) }
        ],
        tmbId: member.tmbId
      })
    ).resolves.toBeUndefined();
  });
});

describe('resolveAppResourcesByPermission', () => {
  it('does not recheck resources already present in the draft baseline', async () => {
    const owner = await getUser(`draft-resource-owner-${getNanoid(6)}`);
    const member = await getUser(`draft-resource-member-${getNanoid(6)}`, owner.teamId);
    const workflowApp = await MongoApp.create({
      name: 'Workflow app',
      type: AppTypeEnum.workflow,
      modules: [],
      edges: [],
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const toolset = await MongoApp.create({
      name: 'Protected toolset',
      type: AppTypeEnum.mcpToolSet,
      modules: [],
      edges: [],
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const baselineResource = { type: 'tool' as const, id: String(toolset._id) };
    await MongoAppVersion.create({
      appId: workflowApp._id,
      tmbId: owner.tmbId,
      nodes: [],
      edges: [],
      resources: [baselineResource]
    });

    await expect(
      resolveAppResourcesByPermission({
        appId: String(workflowApp._id),
        extracted: [baselineResource],
        tmbId: member.tmbId,
        blockOnUnauthorized: true
      })
    ).resolves.toEqual([baselineResource]);

    await expect(
      resolveAppResourcesByPermission({
        appId: String(workflowApp._id),
        extracted: [{ type: 'tool', id: String(workflowApp._id) }],
        tmbId: member.tmbId,
        blockOnUnauthorized: false
      })
    ).resolves.toEqual([]);

    await expect(
      resolveAppResourcesByPermission({
        appId: String(workflowApp._id),
        extracted: [baselineResource, { type: 'tool', id: String(workflowApp._id) }],
        tmbId: member.tmbId,
        blockOnUnauthorized: true
      })
    ).rejects.toBe(AppErrEnum.unAuthApp);
  });

  it('treats an invalid stored snapshot as empty for permission checks', async () => {
    const owner = await getUser(`invalid-draft-resource-owner-${getNanoid(6)}`);
    const member = await getUser(`invalid-draft-resource-member-${getNanoid(6)}`, owner.teamId);
    const workflowApp = await MongoApp.create({
      name: 'Workflow app with invalid snapshot',
      type: AppTypeEnum.workflow,
      modules: [],
      edges: [],
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const protectedToolset = await MongoApp.create({
      name: 'Protected toolset',
      type: AppTypeEnum.mcpToolSet,
      modules: [],
      edges: [],
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    await MongoAppVersion.create({
      appId: workflowApp._id,
      tmbId: owner.tmbId,
      nodes: [],
      edges: [],
      resources: [{ invalid: true } as any]
    });

    await expect(
      resolveAppResourcesByPermission({
        appId: String(workflowApp._id),
        extracted: [{ type: 'tool', id: String(protectedToolset._id) }],
        tmbId: member.tmbId,
        blockOnUnauthorized: true
      })
    ).rejects.toBe(AppErrEnum.unAuthApp);
  });
});
