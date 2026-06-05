import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
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

const { getChildAppPreviewNodeMock, authAppByTmbIdMock } = vi.hoisted(() => ({
  getChildAppPreviewNodeMock: vi.fn(),
  authAppByTmbIdMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/tool/controller', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/core/app/tool/controller')>();
  return {
    ...mod,
    getChildAppPreviewNode: getChildAppPreviewNodeMock
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

describe('rewriteAppWorkflowToDetail - agent skills', () => {
  beforeEach(() => {
    getChildAppPreviewNodeMock.mockReset();
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
          skillId: String(activeSkill._id),
          name: 'Old Skill Name',
          description: 'Old skill description'
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
      isRoot: false
    });

    const rewrittenSkills = skillsInput.value as SelectedAgentSkillItemType[];

    expect(rewrittenSkills).toEqual([
      {
        skillId: String(activeSkill._id),
        name: 'Current Skill Name',
        description: 'Current skill description',
        avatar: 'current-avatar',
        isDeleted: false
      },
      {
        skillId: String(deletedSkill._id),
        name: 'Deleted Snapshot',
        description: 'Deleted snapshot description',
        isDeleted: true
      }
    ]);
  });

  it('刷新最新工具节点时使用新 renderTypeList，并保留旧节点选中的引用类型', async () => {
    getChildAppPreviewNodeMock.mockResolvedValue({
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
            selectedTypeIndex: 1,
            renderTypeList: [FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.reference]
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
      selectedTypeIndex: 1,
      renderTypeList: [FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.reference],
      list: [
        { label: '1', value: '1' },
        { label: '2', value: '2' }
      ]
    });
  });

  it('保留 Agent 工具和 Skill 输入的引用模式值，不按选择列表重写', async () => {
    const toolReferenceValue = ['source-node', 'tools'];
    const skillReferenceValue = ['source-node', 'skills'];
    const toolInput = {
      key: NodeInputKeyEnum.selectedTools,
      renderTypeList: [FlowNodeInputTypeEnum.selectTool, FlowNodeInputTypeEnum.reference],
      selectedTypeIndex: 1,
      value: toolReferenceValue
    };
    const skillsInput = {
      key: NodeInputKeyEnum.skills,
      renderTypeList: [FlowNodeInputTypeEnum.selectSkill, FlowNodeInputTypeEnum.reference],
      selectedTypeIndex: 1,
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
    expect(getChildAppPreviewNodeMock).not.toHaveBeenCalled();
  });

  it('校验嵌套工具权限时透传 root 身份', async () => {
    const toolAppId = '507f1f77bcf86cd799439011';
    getChildAppPreviewNodeMock.mockResolvedValue({
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

  it('保留 Agent 知识库选择输入的引用模式值，不按知识库列表重写', async () => {
    const user = await getUser(`agent-dataset-reference-${getNanoid(6)}`);
    const dataset = await MongoDataset.create({
      name: 'Reference Trigger Dataset',
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    const referenceValue = ['source-node', 'datasets'];
    const datasetSelectInput = {
      key: NodeInputKeyEnum.datasetSelectList,
      renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
      selectedTypeIndex: 1,
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
      isRoot: false
    });

    expect(datasetSelectInput.value).toEqual(referenceValue);
  });

  it('刷新 ChatAgent 的知识库参数快照信息', async () => {
    const user = await getUser(`agent-dataset-params-${getNanoid(6)}`);
    const dataset = await MongoDataset.create({
      name: 'Current Dataset Name',
      avatar: '/icon/current-dataset.svg',
      vectorModel: 'text-embedding-3-small',
      teamId: user.teamId,
      tmbId: user.tmbId
    });
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
      isRoot: false
    });

    const rewrittenDatasetParams = datasetParamsInput.value as AppFormEditFormType['dataset'];

    expect(rewrittenDatasetParams.datasets).toEqual([
      {
        datasetId: String(dataset._id),
        name: 'Current Dataset Name',
        avatar: '/icon/current-dataset.svg',
        vectorModel: getEmbeddingModel('text-embedding-3-small'),
        isDeleted: false
      }
    ]);
  });

  it('兼容旧版单对象知识库选择项并补齐详情快照', async () => {
    const user = await getUser(`legacy-single-dataset-detail-${getNanoid(6)}`);
    const dataset = await MongoDataset.create({
      name: 'Legacy Dataset Name',
      avatar: '/icon/legacy-dataset.svg',
      vectorModel: 'text-embedding-3-small',
      teamId: user.teamId,
      tmbId: user.tmbId
    });
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
      isRoot: false
    });

    expect(datasetSelectInput.value).toEqual([
      {
        datasetId: String(dataset._id),
        name: 'Legacy Dataset Name',
        avatar: '/icon/legacy-dataset.svg',
        vectorModel: getEmbeddingModel('text-embedding-3-small'),
        isDeleted: false
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

    expect(datasetSelectInput.value).toEqual([
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

    expect(datasetSelectInput.value).toEqual([
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
