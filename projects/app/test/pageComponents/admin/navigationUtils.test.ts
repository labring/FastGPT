import { describe, expect, it } from 'vitest';
import { unlicensedAdminRoutes } from '@/components/admin/constants';
import { getUnlicensedAdminTabs } from '@/pageComponents/admin/navigationUtils';

const tabs = [
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

describe('getUnlicensedAdminTabs', () => {
  it('does not expose non-whitelisted children when a group shares a route with its child', () => {
    const result = getUnlicensedAdminTabs(tabs, unlicensedAdminRoutes);

    expect(result.map(({ label }) => label)).toEqual([
      'License 管理',
      '系统模型',
      '系统工具',
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
