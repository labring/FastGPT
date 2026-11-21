import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_SANDBOX_TOOLSET_ID } from '@fastgpt/global/core/ai/sandbox/tools';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';

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

import { buildAgentSkillLabelItem } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useAgentPromptRefs';
import { useSkillManager } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager';

describe('useSkillManager sandbox & skill visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feConfigs = { show_agent_sandbox: false };
    mocks.teamPlanStatus = undefined;
    mocks.systemToolsData = [];
  });

  it('hides sandbox tool and associated skills from @ menu when system sandbox is disabled', async () => {
    const onEnableSandbox = vi.fn();
    const manager = useSkillManager({
      selectedTools: [],
      selectedAgentSkills: [
        { skillId: 'skill-1', source: 'personal', name: '演示技能', description: '' }
      ],
      onUpdateOrAddTool: vi.fn(),
      onAddAgentSkill: vi.fn(() => true),
      onEnableSandbox,
      canUploadFile: true,
      hasSelectedDataset: true,
      useAgentSandbox: true
    });

    expect(manager.skillOption.list.map((item) => item.id)).toEqual([
      'systemTool',
      'myTools',
      'agent'
    ]);
    expect(await manager.skillOption.onSelect('agentSkill')).toBeUndefined();
    expect(mocks.getSkillListV2).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    const ids = mocks.systemToolsData.map((item) => item.id);
    expect(ids).toContain(SubAppIds.readFiles);
    expect(ids).toContain(SubAppIds.datasetSearch);
    expect(ids).not.toContain(AGENT_SANDBOX_TOOLSET_ID);

    const sandboxEntry = manager.promptRefRegistry.resolve('builtin:agent_sandbox');
    expect(sandboxEntry.status === 'resolved' && sandboxEntry.entry.meta.configStatus).toBe(
      'invalid'
    );
    const skillEntry = manager.promptRefRegistry.resolve('skill:team:skill-1');
    expect(skillEntry.status === 'resolved' && skillEntry.entry.meta.configStatus).toBe('invalid');
  });

  it('shows sandbox tool and associated skills when system and plan support sandbox', async () => {
    mocks.feConfigs = { show_agent_sandbox: true };
    mocks.teamPlanStatus = { standard: { enableSandbox: true } };
    const onEnableSandbox = vi.fn();

    const manager = useSkillManager({
      selectedTools: [],
      selectedAgentSkills: [
        { skillId: 'skill-1', source: 'personal', name: '演示技能', description: '' }
      ],
      onUpdateOrAddTool: vi.fn(),
      onAddAgentSkill: vi.fn(() => true),
      onEnableSandbox,
      canUploadFile: true,
      hasSelectedDataset: true,
      useAgentSandbox: true
    });

    expect(manager.skillOption.list.map((item) => item.id)).toEqual([
      'systemTool',
      'myTools',
      'agent',
      'agentSkill'
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.systemToolsData.map((item) => item.id)).toContain(AGENT_SANDBOX_TOOLSET_ID);

    const sandboxEntry = manager.promptRefRegistry.resolve('builtin:agent_sandbox');
    expect(sandboxEntry.status === 'resolved' && sandboxEntry.entry.meta.configStatus).toBe(
      'noConfig'
    );
    const skillEntry = manager.promptRefRegistry.resolve('skill:team:skill-1');
    expect(skillEntry.status === 'resolved' && skillEntry.entry.meta.configStatus).toBe('noConfig');
  });

  it('marks skill label invalid when sandbox is unavailable', () => {
    const item = buildAgentSkillLabelItem({
      skill: { skillId: 'skill-1', name: '演示技能', description: '' },
      writeKey: 'skill:team:skill-1',
      sandboxUnavailable: true
    });
    expect(item.configStatus).toBe('invalid');
  });

  it('hides sandbox tool and associated skills when team plan disables sandbox', async () => {
    mocks.feConfigs = { show_agent_sandbox: true };
    mocks.teamPlanStatus = { standard: { enableSandbox: false } };

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
      'agent'
    ]);
    expect(await manager.skillOption.onSelect('agentSkill')).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.systemToolsData.map((item) => item.id)).not.toContain(AGENT_SANDBOX_TOOLSET_ID);

    const sandboxEntry = manager.promptRefRegistry.resolve('builtin:agent_sandbox');
    expect(sandboxEntry.status === 'resolved' && sandboxEntry.entry.meta.configStatus).toBe(
      'invalid'
    );
    const skillEntry = manager.promptRefRegistry.resolve('skill:team:skill-1');
    expect(skillEntry.status === 'resolved' && skillEntry.entry.meta.configStatus).toBe('invalid');
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
    const actualEntry = manager.promptRefRegistry.resolve(`app:team:${appId}/search`);
    expect(actualEntry.status).toBe('resolved');
    if (actualEntry.status === 'resolved') {
      expect(actualEntry.entry.displayName).toBe('search');
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
