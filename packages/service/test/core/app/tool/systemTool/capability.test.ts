import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { SystemToolListItemType } from '@fastgpt/global/core/app/tool/systemTool/type/base';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { TeamPluginPolicyStatusEnum } from '@fastgpt/global/core/plugin/schema/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

const mocks = vi.hoisted(() => ({
  getUserDetail: vi.fn(),
  getDebugSessionStatus: vi.fn(),
  getSystemToolList: vi.fn(),
  getSystemToolDisplayInfoWithChildIcons: vi.fn(),
  getTeamPluginPolicyMap: vi.fn(),
  assertTeamPluginSourceAccess: vi.fn(),
  getClientToolPreviewNode: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/controller', () => ({
  getUserDetail: mocks.getUserDetail
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin', () => ({
  pluginClient: { getDebugSessionStatus: mocks.getDebugSessionStatus }
}));
vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: () => ({
      getSystemToolList: mocks.getSystemToolList,
      getSystemToolDisplayInfoWithChildIcons: mocks.getSystemToolDisplayInfoWithChildIcons
    })
  }
}));
vi.mock('@fastgpt/service/core/plugin/teamPluginPolicy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/plugin/teamPluginPolicy')>()),
  getTeamPluginPolicyMap: mocks.getTeamPluginPolicyMap,
  assertTeamPluginSourceAccess: mocks.assertTeamPluginSourceAccess
}));
vi.mock('@fastgpt/service/core/app/tool/utils/client', () => ({
  getClientToolPreviewNode: mocks.getClientToolPreviewNode
}));

import {
  getAuthorizedSystemToolTemplateCatalog,
  listAuthorizedSystemToolTemplates
} from '@fastgpt/service/core/app/tool/systemTool/capability';

const context = { teamId: 'team-1', tmbId: 'member-1', isRoot: false, lang: 'en' } as const;

const createTool = (
  id: string,
  overrides: Partial<SystemToolListItemType> = {}
): SystemToolListItemType => ({
  id,
  version: '1.0.0',
  status: PluginStatusEnum.Normal,
  source: 'system',
  isToolSet: false,
  avatar: '',
  name: id,
  intro: '',
  author: '',
  tags: [],
  currentCost: 0,
  systemKeyCost: 0,
  hasTokenFee: false,
  hasSystemSecret: false,
  systemSecretStatus: SystemToolSystemSecretStatusEnum.none,
  ...overrides
});

const createTemplate = (
  id: string,
  overrides: Partial<FlowNodeTemplateType> = {}
): FlowNodeTemplateType => ({
  id,
  name: id,
  flowNodeType: FlowNodeTypeEnum.tool,
  inputs: [],
  outputs: [],
  status: PluginStatusEnum.Normal,
  ...overrides
});

describe('listAuthorizedSystemToolTemplates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUserDetail.mockResolvedValue({ tags: ['hidden-user'] });
    mocks.getDebugSessionStatus.mockResolvedValue(undefined);
  });

  it('filters top-level system and team tools without loading details or toolset children', async () => {
    const teamSource = 'teamId:team-1';
    mocks.getSystemToolList.mockResolvedValue([
      createTool('systemTool-shared'),
      createTool('systemTool-set', { isToolSet: true }),
      createTool('systemTool-shared', { source: teamSource }),
      createTool('systemTool-set', { source: teamSource, isToolSet: true }),
      createTool('systemTool-deleted', { source: teamSource }),
      createTool('systemTool-unregistered', { source: teamSource }),
      createTool('systemTool-shared', { source: 'teamId:another-team' }),
      createTool('systemTool-hidden-by-tag', { hideTags: ['hidden-user'] }),
      ...[PluginStatusEnum.Hidden, PluginStatusEnum.SoonOffline, PluginStatusEnum.Offline].map(
        (status) => createTool(`systemTool-${status}`, { status })
      )
    ]);
    mocks.getTeamPluginPolicyMap.mockResolvedValue(
      new Map([
        ['shared', { pluginId: 'shared', status: TeamPluginPolicyStatusEnum.installed }],
        ['set', { pluginId: 'set', status: TeamPluginPolicyStatusEnum.installed }],
        ['deleted', { pluginId: 'deleted', status: TeamPluginPolicyStatusEnum.deleted }]
      ])
    );

    const tools = await listAuthorizedSystemToolTemplates(context);

    expect(tools.map(({ id, source, flowNodeType }) => ({ id, source, flowNodeType }))).toEqual([
      { id: 'systemTool-shared', source: 'system', flowNodeType: FlowNodeTypeEnum.tool },
      { id: 'systemTool-set', source: 'system', flowNodeType: FlowNodeTypeEnum.toolSet },
      { id: 'systemTool-shared', source: teamSource, flowNodeType: FlowNodeTypeEnum.tool },
      { id: 'systemTool-set', source: teamSource, flowNodeType: FlowNodeTypeEnum.toolSet }
    ]);
    expect(mocks.getSystemToolList).toHaveBeenCalledExactlyOnceWith({
      lang: context.lang,
      op: 'or',
      sources: ['system', teamSource],
      tags: undefined
    });
    expect(mocks.getSystemToolDisplayInfoWithChildIcons).not.toHaveBeenCalled();
    expect(mocks.getClientToolPreviewNode).not.toHaveBeenCalled();
  });
});

describe('getAuthorizedSystemToolTemplateCatalog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUserDetail.mockResolvedValue({ tags: [] });
    mocks.getDebugSessionStatus.mockResolvedValue(undefined);
    mocks.getTeamPluginPolicyMap.mockResolvedValue(new Map());
    mocks.getSystemToolList.mockResolvedValue([]);
    mocks.getClientToolPreviewNode.mockImplementation(async ({ appId }: { appId: string }) =>
      createTemplate(appId)
    );
  });

  it('only loads normal candidates from the tool list', async () => {
    mocks.getSystemToolList.mockResolvedValue([
      createTool('systemTool-normal'),
      ...[PluginStatusEnum.Hidden, PluginStatusEnum.SoonOffline, PluginStatusEnum.Offline].map(
        (status) => createTool(`systemTool-${status}`, { status })
      )
    ]);

    const catalog = await getAuthorizedSystemToolTemplateCatalog(context);

    expect(catalog.map((item) => item.toolId)).toEqual(['systemTool-normal']);
    expect(mocks.getClientToolPreviewNode).toHaveBeenCalledExactlyOnceWith({
      appId: 'systemTool-normal',
      teamId: context.teamId,
      source: 'system',
      getLatestVersion: true,
      lang: context.lang
    });
  });

  it('keeps normal system and installed team tools while excluding deleted and foreign tools', async () => {
    const teamSource = 'teamId:team-1';
    mocks.getSystemToolList.mockResolvedValue([
      createTool('systemTool-shared'),
      createTool('systemTool-shared', { source: teamSource }),
      createTool('systemTool-deleted', { source: teamSource }),
      createTool('systemTool-unregistered', { source: teamSource }),
      createTool('systemTool-shared', { source: 'teamId:another-team' }),
      createTool('systemTool-offline', { status: PluginStatusEnum.Offline })
    ]);
    mocks.getTeamPluginPolicyMap.mockResolvedValue(
      new Map([
        ['shared', { pluginId: 'shared', status: TeamPluginPolicyStatusEnum.installed }],
        ['deleted', { pluginId: 'deleted', status: TeamPluginPolicyStatusEnum.deleted }]
      ])
    );

    const catalog = await getAuthorizedSystemToolTemplateCatalog(context);

    expect(catalog.map(({ toolId, source }) => ({ toolId, source }))).toEqual([
      { toolId: 'systemTool-shared', source: 'system' },
      { toolId: 'systemTool-shared', source: teamSource }
    ]);
    expect(mocks.getSystemToolList).toHaveBeenCalledExactlyOnceWith({
      lang: context.lang,
      op: 'or',
      sources: ['system', teamSource],
      tags: undefined
    });
    expect(mocks.getClientToolPreviewNode).toHaveBeenCalledTimes(2);
    expect(mocks.getClientToolPreviewNode).toHaveBeenCalledWith({
      appId: 'systemTool-shared',
      teamId: context.teamId,
      source: teamSource,
      getLatestVersion: true,
      lang: context.lang
    });
  });

  it('drops a team toolset when it is uninstalled before loading its children', async () => {
    const teamSource = 'teamId:team-1';
    mocks.getSystemToolList.mockResolvedValue([
      createTool('systemTool-set', { source: teamSource, isToolSet: true }),
      createTool('systemTool-healthy')
    ]);
    mocks.getTeamPluginPolicyMap.mockResolvedValue(
      new Map([['set', { pluginId: 'set', status: TeamPluginPolicyStatusEnum.installed }]])
    );
    mocks.assertTeamPluginSourceAccess.mockRejectedValue('plugin.team_not_installed');

    const catalog = await getAuthorizedSystemToolTemplateCatalog(context);

    expect(catalog.map((item) => item.toolId)).toEqual(['systemTool-healthy']);
    expect(mocks.getSystemToolDisplayInfoWithChildIcons).not.toHaveBeenCalled();
  });

  it.each([
    PluginErrEnum.unExist,
    PluginErrEnum.unAuth,
    AppErrEnum.unExist,
    AppErrEnum.unAuthApp,
    'plugin.team_not_installed',
    new Error(PluginErrEnum.unExist)
  ])('keeps healthy tools when a detail becomes unavailable: %s', async (error) => {
    mocks.getSystemToolList.mockResolvedValue([
      createTool('systemTool-stale'),
      createTool('systemTool-healthy')
    ]);
    mocks.getClientToolPreviewNode.mockImplementation(async ({ appId }: { appId: string }) => {
      if (appId === 'systemTool-stale') throw error;
      return createTemplate(appId);
    });

    const catalog = await getAuthorizedSystemToolTemplateCatalog(context);

    expect(catalog.map((item) => item.toolId)).toEqual(['systemTool-healthy']);
  });

  it('rechecks the current status and error metadata after loading details', async () => {
    const invalidDetails: Partial<FlowNodeTemplateType>[] = [
      { status: PluginStatusEnum.Hidden },
      { status: PluginStatusEnum.SoonOffline },
      { status: PluginStatusEnum.Offline },
      { pluginData: { status: PluginStatusEnum.Offline } },
      { pluginData: { error: 'resource_missing' } }
    ];
    const detailsById = new Map(
      invalidDetails.map((detail, index) => [`systemTool-stale-${index}`, detail])
    );
    mocks.getSystemToolList.mockResolvedValue([
      createTool('systemTool-healthy'),
      ...[...detailsById.keys()].map((id) => createTool(id))
    ]);
    mocks.getClientToolPreviewNode.mockImplementation(async ({ appId }: { appId: string }) =>
      createTemplate(appId, detailsById.get(appId))
    );

    const catalog = await getAuthorizedSystemToolTemplateCatalog(context);

    expect(catalog.map((item) => item.toolId)).toEqual(['systemTool-healthy']);
  });

  it('skips an unavailable toolset when expanding its children', async () => {
    mocks.getSystemToolList.mockResolvedValue([
      createTool('systemTool-stale-set', { isToolSet: true }),
      createTool('systemTool-healthy')
    ]);
    mocks.getSystemToolDisplayInfoWithChildIcons.mockRejectedValue(PluginErrEnum.unExist);

    const catalog = await getAuthorizedSystemToolTemplateCatalog(context);

    expect(catalog.map((item) => item.toolId)).toEqual(['systemTool-healthy']);
    expect(mocks.getClientToolPreviewNode).toHaveBeenCalledTimes(1);
  });

  it('removes invalid children from both the catalog and the parent toolset summary', async () => {
    const parentId = 'systemTool-set';
    const children = ['healthy', 'missing', 'hidden', 'offline'].map((id) => ({
      id,
      name: id,
      description: id,
      status: id === 'hidden' ? PluginStatusEnum.Hidden : PluginStatusEnum.Normal,
      currentCost: 0,
      systemKeyCost: 0
    }));
    mocks.getSystemToolList.mockResolvedValue([createTool(parentId, { isToolSet: true })]);
    mocks.getSystemToolDisplayInfoWithChildIcons.mockResolvedValue({
      ...createTool(parentId, { isToolSet: true }),
      children
    });
    mocks.getClientToolPreviewNode.mockImplementation(async ({ appId }: { appId: string }) => {
      if (appId === `${parentId}/missing`) throw PluginErrEnum.unExist;
      if (appId === parentId) {
        return createTemplate(appId, {
          flowNodeType: FlowNodeTypeEnum.toolSet,
          toolConfig: {
            systemToolSet: {
              toolId: parentId,
              toolList: children.map((child) => ({
                toolId: child.id,
                name: child.name,
                description: child.description
              }))
            }
          }
        });
      }
      return createTemplate(appId, {
        status: appId.endsWith('/offline') ? PluginStatusEnum.Offline : PluginStatusEnum.Normal
      });
    });

    const catalog = await getAuthorizedSystemToolTemplateCatalog(context);

    expect(catalog.map((item) => item.toolId)).toEqual([parentId, `${parentId}/healthy`]);
    expect(catalog[0].template.toolConfig?.systemToolSet?.toolList).toEqual([
      { toolId: 'healthy', name: 'healthy', description: 'healthy' }
    ]);
  });

  it('returns an empty catalog when every candidate has become unavailable', async () => {
    mocks.getSystemToolList.mockResolvedValue([createTool('systemTool-stale')]);
    mocks.getClientToolPreviewNode.mockRejectedValue(PluginErrEnum.unExist);

    await expect(getAuthorizedSystemToolTemplateCatalog(context)).resolves.toEqual([]);
  });

  it('excludes child tools when their parent becomes unavailable during detail loading', async () => {
    const parentId = 'systemTool-set';
    mocks.getSystemToolList.mockResolvedValue([createTool(parentId, { isToolSet: true })]);
    mocks.getSystemToolDisplayInfoWithChildIcons.mockResolvedValue({
      ...createTool(parentId, { isToolSet: true }),
      children: [{ id: 'child', name: 'Child', status: PluginStatusEnum.Normal }]
    });
    mocks.getClientToolPreviewNode.mockImplementation(async ({ appId }: { appId: string }) => {
      if (appId === parentId) throw PluginErrEnum.unExist;
      return createTemplate(appId);
    });

    await expect(getAuthorizedSystemToolTemplateCatalog(context)).resolves.toEqual([]);
  });

  it.each(['children', 'detail'])(
    'still propagates service failures during %s loading',
    async (stage) => {
      const failure = new Error('Plugin service connection refused');
      mocks.getSystemToolList.mockResolvedValue([
        createTool('systemTool-set', { isToolSet: stage === 'children' })
      ]);
      if (stage === 'children') {
        mocks.getSystemToolDisplayInfoWithChildIcons.mockRejectedValue(failure);
      } else {
        mocks.getClientToolPreviewNode.mockRejectedValue(failure);
      }

      await expect(getAuthorizedSystemToolTemplateCatalog(context)).rejects.toBe(failure);
    }
  );
});
