import { describe, expect, it } from 'vitest';
import {
  beforeUpdateAppFormat,
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

describe('beforeUpdateAppFormat', () => {
  it.each([SystemToolSecretInputTypeEnum.system, SystemToolSecretInputTypeEnum.team])(
    '保存前清理 %s 类型中的临时密钥值',
    (type) => {
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

      beforeUpdateAppFormat({ nodes });

      expect(nodes[0].inputs[0].value).toEqual({ type });
    }
  );

  it('即使系统输入被标记为引用，也不能保留临时密钥值', () => {
    const nodes = [
      {
        inputs: [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            selectedTypeIndex: 0,
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

    beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual({
      type: SystemToolSecretInputTypeEnum.system
    });
  });

  it('保存前仅加密 manual 类型的临时密钥值', () => {
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

    beforeUpdateAppFormat({ nodes });

    const value = nodes[0].inputs[0].value as any;
    expect(value.type).toBe(SystemToolSecretInputTypeEnum.manual);
    expect(value.value.apiKey.value).toBe('');
    expect(value.value.apiKey.secret).toEqual(expect.any(String));
    expect(value.value.region).toBe('cn');
  });

  it('保存前统一压缩知识库选择项，去掉编辑态删除标记和快照字段', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedTypeIndex: 0,
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
        ]
      } as StoreNodeItemType
    ];

    beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual([
      {
        datasetId: 'dataset-1'
      }
    ]);
  });

  it('保存前兼容旧版单对象知识库选择项', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedTypeIndex: 0,
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

    beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual([
      {
        datasetId: 'dataset-legacy'
      }
    ]);
  });

  it('保存前兼容已压缩的知识库选择项数组', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedTypeIndex: 0,
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

    beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toEqual([
      {
        datasetId: 'dataset-1'
      },
      {
        datasetId: 'dataset-2'
      }
    ]);
  });

  it('保存前统一压缩 Agent datasetParams 中的知识库选择项', () => {
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

    beforeUpdateAppFormat({ nodes });

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

  it('保存前保留知识库选择输入的引用模式值', () => {
    const referenceValue = ['sourceNode', 'datasets'];
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedTypeIndex: 1,
            value: referenceValue
          }
        ]
      } as StoreNodeItemType
    ];

    beforeUpdateAppFormat({ nodes });

    expect(nodes[0].inputs[0].value).toBe(referenceValue);
  });

  it('保存前遇到非法知识库选择项时抛错，避免清空后继续保存', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
            selectedTypeIndex: 0,
            value: [
              {
                name: 'Invalid Dataset'
              }
            ]
          }
        ]
      } as StoreNodeItemType
    ];

    expect(() => beforeUpdateAppFormat({ nodes })).toThrow();
  });

  it('保存前移除 Agent Skill 的编辑态删除标记和展示快照字段', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          {
            key: NodeInputKeyEnum.skills,
            renderTypeList: [FlowNodeInputTypeEnum.selectSkill, FlowNodeInputTypeEnum.reference],
            selectedTypeIndex: 0,
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

    beforeUpdateAppFormat({ nodes });

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
