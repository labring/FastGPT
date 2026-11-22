import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';

const mocks = vi.hoisted(() => ({
  feConfigs: { show_agent_sandbox: false } as Record<string, any>,
  teamPlanStatus: undefined as Record<string, any> | undefined,
  systemToolsData: [] as any[],
  getAppToolTemplates: vi.fn(async () => []),
  getNewToolPreviewNode: vi.fn(),
  getSkillListV2: vi.fn(async () => ({ list: [], total: 0 })),
  toast: vi.fn()
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [initial, vi.fn()]
}));
vi.mock('@fastgpt/web/hooks/useMemoEnhance', () => ({
  useMemoEnhance: (fn: () => unknown) => fn()
}));
vi.mock('ahooks', () => ({
  useLatest: (value: unknown) => ({ current: value })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (fn: () => Promise<any>) => {
    mocks.systemToolsData = [];
    void fn().then((res) => {
      mocks.systemToolsData = res;
    });
    return { data: mocks.systemToolsData };
  }
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: mocks.feConfigs })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ teamPlanStatus: mocks.teamPlanStatus })
}));
vi.mock('@/web/core/app/api/tool', () => ({
  getAppToolTemplates: mocks.getAppToolTemplates,
  getNewToolPreviewNode: mocks.getNewToolPreviewNode,
  getTeamAppTemplatesV2: vi.fn(async () => ({ list: [], total: 0 }))
}));
vi.mock('@/web/core/skill/api', () => ({
  getSkillListV2: mocks.getSkillListV2
}));

import { useAgentPromptRefs } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useAgentPromptRefs';
import { useSkillManager } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager';

describe('useSkillManager sandbox & skill visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feConfigs = { show_agent_sandbox: false };
    mocks.teamPlanStatus = undefined;
    mocks.systemToolsData = [];
  });

  it.each([
    {
      name: 'system disabled',
      systemEnabled: false,
      planEnabled: undefined,
      showSkills: false,
      status: 'invalid'
    },
    {
      name: 'plan disabled',
      systemEnabled: true,
      planEnabled: false,
      showSkills: false,
      status: 'invalid'
    },
    {
      name: 'system and plan enabled',
      systemEnabled: true,
      planEnabled: true,
      showSkills: true,
      status: 'noConfig'
    }
  ])(
    'reflects sandbox availability with $name',
    async ({ systemEnabled, planEnabled, showSkills, status }) => {
      mocks.feConfigs = { show_agent_sandbox: systemEnabled };
      mocks.teamPlanStatus =
        planEnabled === undefined ? undefined : { standard: { enableSandbox: planEnabled } };

      const manager = useSkillManager({
        selectedTools: [],
        selectedAgentSkills: [
          { skillId: 'skill-1', source: 'personal', name: '演示技能', description: '' }
        ],
        onUpdateOrAddTool: vi.fn(),
        onAddAgentSkill: vi.fn(() => true),
        onEnableSandbox: vi.fn(),
        canUploadFile: true,
        hasSelectedDataset: true,
        useAgentSandbox: true
      });

      expect(manager.skillOption.list.map((item) => item.id)).toEqual([
        'systemTool',
        'myTools',
        'agent',
        ...(showSkills ? ['agentSkill'] : [])
      ]);
      if (!showSkills) {
        expect(await manager.skillOption.onSelect('agentSkill')).toBeUndefined();
        expect(mocks.getSkillListV2).not.toHaveBeenCalled();
      }

      await vi.waitFor(() =>
        expect(mocks.systemToolsData.map((item) => item.id)).toEqual(
          expect.arrayContaining([SubAppIds.readFiles, SubAppIds.datasetSearch])
        )
      );
      expect(mocks.systemToolsData.some((item) => item.id === AGENT_SANDBOX_TOOLSET_ID)).toBe(
        showSkills
      );

      for (const key of ['builtin:agent_sandbox', 'skill:team:skill-1']) {
        expect(manager.promptRefRegistry.resolve(key)).toMatchObject({
          status: 'resolved',
          entry: { meta: { configStatus: status } }
        });
      }
    }
  );

  it('uses the saved toolset source and qualifies slash-named system children in the editor', () => {
    const id = 'systemTool-search';
    const systemToolSet = {
      toolId: id,
      toolList: [
        { toolId: 'catalog/search', name: 'Search catalog' },
        { toolId: `${id}/catalog/list`, name: 'List catalog' }
      ]
    };
    const tool: SelectedToolItemType = {
      id,
      pluginId: id,
      name: 'Search',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      inputs: [],
      outputs: [],
      toolConfig: { systemToolSet }
    };
    const teamTool = {
      ...tool,
      toolConfig: {
        systemToolSet: {
          ...systemToolSet,
          source: 'teamId:team-1'
        }
      }
    };
    const { promptRefRegistry, getToolWriteKey } = useAgentPromptRefs({
      selectedTools: [tool, teamTool],
      canUploadFile: true,
      hasSelectedDataset: true,
      useAgentSandbox: false,
      lang: 'en'
    });

    expect(getToolWriteKey(teamTool)).toBe('plugin:team:team-1:search');
    expect(promptRefRegistry.resolve('plugin:system:search/catalog/search')).toMatchObject({
      status: 'resolved',
      entry: { meta: { configTarget: tool } }
    });
    expect(promptRefRegistry.resolve('plugin:team:team-1:search/catalog/list')).toMatchObject({
      status: 'resolved',
      entry: { meta: { configTarget: teamTool } }
    });
    expect(promptRefRegistry.resolve('app:team:catalog/search').status).toBe('unresolved');
  });

  it('uses resolved toolConfig.toolId so deleted slash-named V2 child refs stay unresolved in editor just like runtime', () => {
    const appId = '507f1f77bcf86cd799439031';
    const manager = useSkillManager({
      selectedTools: [
        {
          id: `mcp-${appId}/catalog/search`,
          pluginId: `mcp-${appId}/catalog/search`,
          name: 'search',
          avatar: '',
          intro: '',
          flowNodeType: 'tool' as any,
          templateType: 'tools' as any,
          inputs: [],
          outputs: [],
          toolConfig: {
            mcpTool: {
              toolId: `mcp-${appId}/search`
            }
          }
        } as any
      ],
      onUpdateOrAddTool: vi.fn(),
      onAddAgentSkill: vi.fn(() => true),
      onEnableSandbox: vi.fn(),
      canUploadFile: true,
      hasSelectedDataset: true,
      useAgentSandbox: true
    });

    expect(manager.promptRefRegistry.resolve(`app:team:${appId}/catalog/search`).status).toBe(
      'unresolved'
    );
    const legacyEntry = manager.promptRefRegistry.resolve(`mcp-${appId}/catalog/search`);
    expect(legacyEntry.status).toBe('resolved');
    if (legacyEntry.status === 'resolved') {
      expect(legacyEntry.entry.displayName).toBe('search');
      expect(legacyEntry.entry.meta.configTarget?.id).toBe(`mcp-${appId}/catalog/search`);
    }
    const actualEntry = manager.promptRefRegistry.resolve(`app:team:${appId}/search`);
    expect(actualEntry.status).toBe('resolved');
    if (actualEntry.status === 'resolved') {
      expect(actualEntry.entry.displayName).toBe('search');
      expect(actualEntry.entry.meta.configTarget?.id).toBe(`mcp-${appId}/catalog/search`);
    }
  });

  it('validates MCP/HTTP child menu items via live preview even when selectedTools still holds pre-deletion data, and reuses existing tool when confirmed', async () => {
    const appId = '507f1f77bcf86cd799439031';
    const httpAppId = '507f1f77bcf86cd799439032';
    const onUpdateOrAddTool = vi.fn();
    mocks.getNewToolPreviewNode
      .mockResolvedValueOnce({
        id: `mcp-${appId}/catalog/search`,
        pluginId: `mcp-${appId}/catalog/search`,
        name: 'search',
        avatar: '',
        intro: '',
        flowNodeType: 'tool',
        templateType: 'tools',
        inputs: [],
        outputs: [],
        toolConfig: {
          mcpTool: {
            toolId: `mcp-${appId}/search`
          }
        }
      })
      .mockResolvedValueOnce({
        id: `http-${httpAppId}//api/v1/users`,
        pluginId: `http-${httpAppId}//api/v1/users`,
        name: 'users',
        avatar: '',
        intro: '',
        flowNodeType: 'tool',
        templateType: 'tools',
        inputs: [],
        outputs: [],
        toolConfig: {
          httpTool: {
            toolId: `http-${httpAppId}/users`
          }
        }
      })
      .mockResolvedValueOnce({
        id: `mcp-${appId}/search`,
        pluginId: `mcp-${appId}/search`,
        name: 'search',
        avatar: '',
        intro: '',
        flowNodeType: 'tool',
        templateType: 'tools',
        inputs: [],
        outputs: [],
        toolConfig: {
          mcpTool: {
            toolId: `mcp-${appId}/search`
          }
        }
      });

    const manager = useSkillManager({
      selectedTools: [
        // 模拟未刷新编辑页中仍保留删除前的 toolConfig.toolId
        {
          id: `mcp-${appId}/catalog/search`,
          pluginId: `mcp-${appId}/catalog/search`,
          name: 'catalog/search',
          avatar: '',
          intro: '',
          flowNodeType: 'tool' as any,
          templateType: 'tools' as any,
          inputs: [],
          outputs: [],
          toolConfig: {
            mcpTool: {
              toolId: `mcp-${appId}/catalog/search`
            }
          }
        } as any,
        {
          id: `http-${httpAppId}//api/v1/users`,
          pluginId: `http-${httpAppId}//api/v1/users`,
          name: '/api/v1/users',
          avatar: '',
          intro: '',
          flowNodeType: 'tool' as any,
          templateType: 'tools' as any,
          inputs: [],
          outputs: [],
          toolConfig: {
            httpTool: {
              toolId: `http-${httpAppId}//api/v1/users`
            }
          }
        } as any,
        {
          id: `mcp-${appId}/search`,
          pluginId: `mcp-${appId}/search`,
          name: 'search',
          avatar: '',
          intro: '',
          flowNodeType: 'tool' as any,
          templateType: 'tools' as any,
          inputs: [],
          outputs: [],
          toolConfig: {
            mcpTool: {
              toolId: `mcp-${appId}/search`
            }
          }
        } as any
      ],
      onUpdateOrAddTool,
      onAddAgentSkill: vi.fn(() => true),
      onEnableSandbox: vi.fn(),
      canUploadFile: true,
      hasSelectedDataset: true,
      useAgentSandbox: true
    });

    const myToolsMenu = await manager.skillOption.onSelect('myTools');
    expect(myToolsMenu?.onClick).toBeDefined();

    // 选中已删除的旧菜单项（即使本地 selectedTools 仍持有删除前数据）：实时预览发现回退后拒绝插入
    const staleMcpRes = await myToolsMenu!.onClick!(`mcp-${appId}/catalog/search`);
    expect(staleMcpRes).toBeUndefined();
    const staleHttpRes = await myToolsMenu!.onClick!(`http-${httpAppId}//api/v1/users`);
    expect(staleHttpRes).toBeUndefined();
    expect(onUpdateOrAddTool).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledTimes(2);
    expect(mocks.toast).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'common:core.workflow.check.tool_missing',
        status: 'warning'
      })
    );

    // 选中真实存在的 mcp-appId/search：实时校验通过后复用已有工具并写出与注册表一致的 V2 规范键
    const validRes = await myToolsMenu!.onClick!(`mcp-${appId}/search`);
    expect(mocks.getNewToolPreviewNode).toHaveBeenCalledTimes(3);
    expect(onUpdateOrAddTool).not.toHaveBeenCalled();
    expect(validRes?.id).toBe(`app:team:${appId}/search`);
    expect(manager.promptRefRegistry.resolve(validRes!.id).status).toBe('resolved');
  });
});
