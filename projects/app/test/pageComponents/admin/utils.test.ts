import { describe, expect, it } from 'vitest';
import { isRouteVisible } from '@/pageComponents/admin/utils';
import { getAdminMenuList } from '@/pageComponents/admin/useAdminMenu';

describe('isRouteVisible', () => {
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

  it('uses deployment edition for configuration and license only for commercial business', () => {
    expect(
      isRouteVisible('/admin/settings/core', { isProService: false, licenseActive: false })
    ).toBe(true);
    expect(isRouteVisible('/admin/settings/pay', { isProService: false })).toBe(false);
    expect(
      isRouteVisible('/admin/settings/pay', { isProService: true, licenseActive: false })
    ).toBe(true);
    expect(isRouteVisible('/admin/pays', { isProService: true, licenseActive: false })).toBe(false);
    expect(isRouteVisible('/admin/subservice/code-sandbox', { isProService: false })).toBe(false);
    expect(isRouteVisible('/admin/subservice/code-sandbox', { isProService: true })).toBe(true);
  });
});
