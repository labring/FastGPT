import { describe, expect, it } from 'vitest';
import { isRouteVisible } from '@/pageComponents/admin/utils';
import { getAdminMenuList } from '@/pageComponents/admin/useAdminMenu';

describe('isRouteVisible', () => {
  it('hides account and login configuration in community while retaining Pro access without activation', () => {
    expect(isRouteVisible('/admin/settings/auth', { isProService: false })).toBe(false);
    expect(
      isRouteVisible('/admin/settings/auth', { isProService: true, licenseActive: false })
    ).toBe(true);
  });
  it('blocks the feature settings page in community edition, including direct access', () => {
    expect(isRouteVisible('/admin/settings/feature', { isProService: false })).toBe(false);
    expect(isRouteVisible('/admin/settings/feature', { isProService: true })).toBe(true);
  });

  it('blocks the entire site information page in community edition, including direct access', () => {
    expect(isRouteVisible('/admin/settings/site', { isProService: false })).toBe(false);
    expect(isRouteVisible('/admin/settings/site', { isProService: true })).toBe(true);
    expect(isRouteVisible('/admin/settings/core', { isProService: false })).toBe(true);
  });

  it('blocks direct access to external provider settings without saved variables', () => {
    expect(isRouteVisible('/admin/settings/providers', { isProService: true })).toBe(false);
    expect(
      isRouteVisible('/admin/settings/providers', {
        isProService: true,
        hasExternalProviderWorkflowVariables: false
      })
    ).toBe(false);
    expect(
      isRouteVisible('/admin/settings/providers', {
        isProService: false,
        hasExternalProviderWorkflowVariables: true
      })
    ).toBe(true);
  });

  it.each([
    { isProService: false, licenseActive: false },
    { isProService: true, licenseActive: false },
    { isProService: true, licenseActive: true, hasPayCapability: false }
  ])('keeps every menu destination accessible under the same rules: %j', (options) => {
    for (const menu of getAdminMenuList(options)) {
      for (const item of menu.children ?? [menu]) {
        expect(isRouteVisible(item.value, options)).toBe(true);
      }
    }
  });

  it('keeps ordinary configuration available and requires activation for payment configuration', () => {
    expect(
      isRouteVisible('/admin/settings/core', { isProService: false, licenseActive: false })
    ).toBe(true);
    expect(isRouteVisible('/admin/settings/pay', { isProService: false })).toBe(false);
    expect(
      isRouteVisible('/admin/settings/pay', { isProService: true, licenseActive: false })
    ).toBe(false);
    expect(isRouteVisible('/admin/settings/pay', { isProService: true, licenseActive: true })).toBe(
      true
    );
    expect(isRouteVisible('/admin/pays', { isProService: true, licenseActive: false })).toBe(false);
    expect(isRouteVisible('/admin/subservice/code-sandbox', { isProService: false })).toBe(true);
    expect(isRouteVisible('/admin/subservice/code-sandbox', { isProService: true })).toBe(true);
    expect(isRouteVisible('/admin/subservice/mcp', { isProService: false })).toBe(true);
    expect(
      isRouteVisible('/admin/subservice/agent-sandbox', {
        isProService: false,
        licenseActive: false
      })
    ).toBe(true);
  });
});
