import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { getNewToolPreviewNodeMock } = vi.hoisted(() => ({
  getNewToolPreviewNodeMock: vi.fn()
}));

vi.mock('@/web/core/app/api/tool', () => ({
  getNewToolPreviewNode: getNewToolPreviewNodeMock
}));

import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  agentForm2AppWorkflow,
  applyChatAgentHelperFormData,
  hasHelperSandboxOrSkillConfig,
  loadGeneratedTools
} from '@/pageComponents/app/detail/Edit/ChatAgent/utils';

describe('loadGeneratedTools V2 & legacy compatibility', () => {
  beforeEach(() => {
    getNewToolPreviewNodeMock.mockReset();
  });

  it('loads V2 canonical plugin/team/app keys and reuses existing tools without duplicate fetch', async () => {
    getNewToolPreviewNodeMock.mockImplementation(async ({ appId, source }) => ({
      id: appId,
      pluginId: appId,
      source,
      name: `Tool ${appId}`,
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.tool,
      templateType: 'tools',
      inputs: [],
      outputs: []
    }));

    const existingTeamTool = {
      id: 'systemTool-metaso',
      pluginId: 'systemTool-metaso',
      source: 'teamId:67a100000000000000000001',
      name: '团队秘塔(已配置)',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.tool,
      templateType: 'tools',
      inputs: [],
      outputs: []
    } as any;

    const result = await loadGeneratedTools({
      newToolIds: [
        'plugin:system:metaso',
        'plugin:team:67a100000000000000000001:metaso',
        'app:team:66f100000000000000000011',
        'builtin:read_files'
      ],
      existsTools: [existingTeamTool]
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: 'systemTool-metaso', source: 'system' });
    expect(result[1]).toBe(existingTeamTool);
    expect(result[2]).toMatchObject({ id: '66f100000000000000000011', source: undefined });
    expect(getNewToolPreviewNodeMock).toHaveBeenCalledTimes(2);
    expect(getNewToolPreviewNodeMock).toHaveBeenCalledWith({
      appId: 'systemTool-metaso',
      source: 'system'
    });
    expect(getNewToolPreviewNodeMock).toHaveBeenCalledWith({
      appId: '66f100000000000000000011',
      source: undefined
    });
  });

  it('preserves canonical mcp-/http- ids returned by preview lookup for unselected V2 child tools', async () => {
    const mcpParentId = '66f100000000000000000021';
    const httpParentId = '66f100000000000000000022';
    getNewToolPreviewNodeMock
      .mockResolvedValueOnce({
        id: 'preview-node-id-1',
        pluginId: `mcp-${mcpParentId}/search`,
        name: 'search',
        avatar: '',
        intro: '',
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: 'tools',
        inputs: [],
        outputs: []
      })
      .mockResolvedValueOnce({
        id: 'preview-node-id-2',
        pluginId: `http-${httpParentId}//api/v1/users`,
        name: '/api/v1/users',
        avatar: '',
        intro: '',
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: 'tools',
        inputs: [],
        outputs: []
      });

    const result = await loadGeneratedTools({
      newToolIds: [`app:team:${mcpParentId}/search`, `app:team:${httpParentId}//api/v1/users`]
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: `mcp-${mcpParentId}/search` });
    expect(result[1]).toMatchObject({ id: `http-${httpParentId}//api/v1/users` });
  });

  it('preserves historical skills and sandbox toggle when applying non-sandbox helper config while sandbox is unavailable', () => {
    const prev = getDefaultAppForm();
    prev.aiSettings.useAgentSandbox = true;
    prev.selectedAgentSkills = [
      {
        skillId: '6a55f9a0c157b3ab4fa2f38e',
        source: 'personal',
        name: '历史 PPT 技能',
        description: ''
      }
    ];

    const formData = {
      systemPrompt: '只做文本总结',
      tools: [],
      datasets: [],
      selectedAgentSkills: [],
      fileUploadEnabled: true,
      enableSandboxEnabled: false
    };

    expect(hasHelperSandboxOrSkillConfig(formData)).toBe(false);
    const nextForm = applyChatAgentHelperFormData({
      prev,
      formData,
      newTools: [],
      canUseSandbox: false
    });

    expect(nextForm.selectedAgentSkills).toEqual(prev.selectedAgentSkills);
    expect(nextForm.aiSettings.useAgentSandbox).toBe(true);
    expect(nextForm.aiSettings.systemPrompt).toBe('只做文本总结');

    const workflow = agentForm2AppWorkflow(nextForm, (key: string) => key);
    const agentNode = workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.agent);
    expect(agentNode?.inputs.find((input) => input.key === NodeInputKeyEnum.skills)?.value).toEqual(
      prev.selectedAgentSkills
    );
    expect(
      agentNode?.inputs.find((input) => input.key === NodeInputKeyEnum.useAgentSandbox)?.value
    ).toBe(true);
  });

  it('detects unsupported sandbox or skill references in helper deliveries when sandbox is unavailable', () => {
    expect(
      hasHelperSandboxOrSkillConfig({
        systemPrompt: '按 {{@skill:team:6a55f9a0c157b3ab4fa2f38e@}} 生成',
        tools: [],
        datasets: [],
        fileUploadEnabled: false
      })
    ).toBe(true);
    expect(
      hasHelperSandboxOrSkillConfig({
        systemPrompt: '在 {{@builtin:agent_sandbox@}} 中执行',
        tools: [],
        datasets: [],
        fileUploadEnabled: false
      })
    ).toBe(true);
    expect(
      hasHelperSandboxOrSkillConfig({
        systemPrompt: '纯文本',
        tools: [],
        datasets: [],
        fileUploadEnabled: false,
        enableSandboxEnabled: true
      })
    ).toBe(true);
  });
});
