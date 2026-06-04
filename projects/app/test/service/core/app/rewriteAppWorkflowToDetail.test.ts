import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
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
});
