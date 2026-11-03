import { describe, expect, it } from 'vitest';
import type { SecondaryNavigationTab } from '@/pageComponents/common/SecondaryNavigationContainer';
import { getUnlicensedAdminTabs } from '@/pageComponents/admin/navigationUtils';
import { isRouteVisible } from '@/pageComponents/admin/utils';

const tabs: SecondaryNavigationTab<string>[] = [
  {
    icon: 'common/layer',
    label: '系统资源',
    value: '/admin/resources/model',
    children: [
      {
        icon: 'common/model',
        label: '系统模型',
        value: '/admin/resources/model'
      },
      {
        icon: 'common/toolkit',
        label: '系统工具',
        value: '/admin/resources/tool'
      },
      {
        icon: 'common/templateMarket',
        label: '应用模板',
        value: '/admin/resources/app_template'
      }
    ]
  },
  {
    icon: 'common/wallet',
    label: 'License 管理',
    value: '/admin/license'
  },
  {
    icon: 'common/rocket',
    label: '版本升级',
    value: '/admin/migration'
  }
];

/**
 * 可见性来源改为 isRouteVisible 后，固定的 unlicensedAdminRoutes 死名单已删除，
 * 允许路由需按「未激活 License 的社区部署」现场推导，与菜单/路由拦截保持同一规则。
 */
const getAllowedRoutes = () => {
  const options = { isProService: false, licenseActive: false };
  const routes = tabs.flatMap((tab) => [
    tab.value,
    ...(tab.children?.map((child) => child.value) ?? [])
  ]);

  return [...new Set(routes)].filter((route) => isRouteVisible(route, options));
};

describe('getUnlicensedAdminTabs', () => {
  it('does not expose non-whitelisted children when a group shares a route with its child', () => {
    const result = getUnlicensedAdminTabs(tabs, getAllowedRoutes());

    // 结果顺序跟随 allowedRoutes；分组与其子项同路由时只保留命中的子项，
    // 因此应用模板（商业版且需 License 激活）被剔除，而不是随分组一起暴露。
    expect(result.map(({ label }) => label)).toEqual([
      '系统模型',
      '系统工具',
      'License 管理',
      '版本升级'
    ]);
    expect(result.flatMap((tab) => tab.children ?? []).map(({ label }) => label)).not.toContain(
      '应用模板'
    );
  });

  it('prefers a matching child over its group when they share an allowed route', () => {
    const result = getUnlicensedAdminTabs(tabs, ['/admin/resources/model']);

    expect(result.map(({ label }) => label)).toEqual(['系统模型']);
  });
});
