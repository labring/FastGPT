import { shouldRouteReadOnlyAppToLogs } from '@/pageComponents/app/detail/permissionRouting';
import { TabEnum } from '@/pageComponents/app/detail/context';
import { describe, expect, it } from 'vitest';

describe('shouldRouteReadOnlyAppToLogs', () => {
  it('routes a read-only collaborator away from editable tabs', () => {
    expect(
      shouldRouteReadOnlyAppToLogs({
        hasWritePermission: false,
        currentTab: TabEnum.appEdit
      })
    ).toBe(true);
  });

  it('does not repeatedly route a read-only collaborator already viewing logs', () => {
    expect(
      shouldRouteReadOnlyAppToLogs({
        hasWritePermission: false,
        currentTab: TabEnum.logs
      })
    ).toBe(false);
  });

  it('keeps writable apps on the requested tab', () => {
    expect(
      shouldRouteReadOnlyAppToLogs({
        hasWritePermission: true,
        currentTab: TabEnum.appEdit
      })
    ).toBe(false);
  });
});
