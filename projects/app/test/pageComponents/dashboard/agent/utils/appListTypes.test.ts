import { describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { resolveDashboardAppListTypes } from '@/pageComponents/dashboard/agent/utils/appListTypes';

describe('resolveDashboardAppListTypes', () => {
  it('should include legacy HTTP plugin apps in the dashboard tool all list', () => {
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
  });

  it('should include legacy HTTP plugin apps when filtering dashboard tools by HTTP toolset', () => {
    expect(
      resolveDashboardAppListTypes({
        pathname: '/dashboard/tool',
        type: AppTypeEnum.httpToolSet
      })
    ).toEqual([AppTypeEnum.toolFolder, AppTypeEnum.httpToolSet, AppTypeEnum.httpPlugin]);
  });

  it('should keep agent page type filters unchanged', () => {
    expect(
      resolveDashboardAppListTypes({
        pathname: '/dashboard/agent',
        type: AppTypeEnum.workflow
      })
    ).toEqual([AppTypeEnum.folder, AppTypeEnum.workflow]);
  });
});
