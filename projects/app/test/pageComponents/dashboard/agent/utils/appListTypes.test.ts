import { describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  getDashboardAppListScene,
  resolveDashboardAppListTypes
} from '@/pageComponents/dashboard/agent/utils/appListTypes';

describe('dashboard app list types', () => {
  it('resolves scene from pathname', () => {
    expect(getDashboardAppListScene('/dashboard/agent')).toBe('agent');
    expect(getDashboardAppListScene('/dashboard/tool')).toBe('tool');
    expect(getDashboardAppListScene('/dashboard/systemTool')).toBe('other');
    expect(getDashboardAppListScene('/chat/team')).toBe('chat');
  });

  it('maps scene and type to list API types', () => {
    expect(
      resolveDashboardAppListTypes({
        pathname: '/dashboard/tool',
        type: 'all'
      })
    ).toEqual([
      AppTypeEnum.toolFolder,
      AppTypeEnum.workflowTool,
      AppTypeEnum.mcpToolSet,
      AppTypeEnum.httpToolSet,
      AppTypeEnum.httpPlugin
    ]);
    expect(
      resolveDashboardAppListTypes({
        pathname: '/dashboard/tool',
        type: AppTypeEnum.httpToolSet
      })
    ).toEqual([AppTypeEnum.toolFolder, AppTypeEnum.httpToolSet, AppTypeEnum.httpPlugin]);
    expect(
      resolveDashboardAppListTypes({
        pathname: '/dashboard/tool',
        type: AppTypeEnum.workflowTool
      })
    ).toEqual([AppTypeEnum.toolFolder, AppTypeEnum.workflowTool]);
    expect(
      resolveDashboardAppListTypes({
        pathname: '/dashboard/agent',
        type: AppTypeEnum.workflow
      })
    ).toEqual([AppTypeEnum.folder, AppTypeEnum.workflow]);
    expect(
      resolveDashboardAppListTypes({
        pathname: '/chat',
        type: 'all'
      })
    ).toEqual([
      AppTypeEnum.folder,
      AppTypeEnum.toolFolder,
      AppTypeEnum.chatAgent,
      AppTypeEnum.simple,
      AppTypeEnum.workflow,
      AppTypeEnum.workflowTool
    ]);
  });
});
