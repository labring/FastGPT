import { describe, expect, it } from 'vitest';
import { getAdminMenuList, communityAdminRoutes } from '@/pageComponents/admin/useAdminMenu';

describe('getAdminMenuList', () => {
  it('returns only community allowed menu items when isProService is false', () => {
    const menus = getAdminMenuList({ isProService: false });

    const topLabels = menus.map((item) => item.label);

    // 开源版仅可见：概览、系统资源、版本升级
    expect(topLabels).toEqual(['概览', '系统资源', '版本升级']);

    // 概览子菜单：许可证、系统版本
    const overviewMenu = menus.find((item) => item.label === '概览');
    expect(overviewMenu?.children?.map((c) => c.value)).toEqual([
      '/admin/license',
      '/admin/version'
    ]);

    // 系统资源子菜单：仅系统模型、系统工具（应用模板不可见）
    const resourceMenu = menus.find((item) => item.label === '系统资源');
    expect(resourceMenu?.children?.map((c) => c.value)).toEqual([
      '/admin/resources/model',
      '/admin/resources/tool'
    ]);

    // 版本升级
    const migrationMenu = menus.find((item) => item.label === '版本升级');
    expect(migrationMenu?.value).toBe('/admin/migration');

    // 收集开源版渲染出的所有叶子路由，确保严格等于白名单
    const renderedRoutes = menus.flatMap((item) =>
      item.children && item.children.length > 0 ? item.children.map((c) => c.value) : [item.value]
    );
    expect(renderedRoutes).toEqual(communityAdminRoutes);

    // 确认商业化、子服务、数据面板、系统配置等均不可见
    expect(topLabels).not.toContain('商业化');
    expect(topLabels).not.toContain('子服务');
    expect(topLabels).not.toContain('数据面板');
    expect(topLabels).not.toContain('系统配置');
    expect(topLabels).not.toContain('运营管理');
    expect(topLabels).not.toContain('用户与团队');
    expect(topLabels).not.toContain('用户资源');
    expect(topLabels).not.toContain('审计日志');
  });

  it('returns full commercial menu list when isProService is true (PRO_URL exists)', () => {
    const menus = getAdminMenuList({ isProService: true, hasPayCapability: true });

    const menuLabels = menus.map((item) => item.label);

    // 商业版必须包含商业化与子服务
    expect(menuLabels).toContain('商业化');
    expect(menuLabels).toContain('子服务');
    expect(menuLabels).toContain('数据面板');
    expect(menuLabels).toContain('系统配置');

    // 验证商业化子菜单
    const commercialMenu = menus.find((item) => item.label === '商业化');
    expect(commercialMenu?.children?.map((c) => c.value)).toEqual([
      '/admin/plans',
      '/admin/pays',
      '/admin/invoice',
      '/admin/settings/pay'
    ]);

    // 验证子服务监控子菜单
    const subserviceMenu = menus.find((item) => item.label === '子服务');
    expect(subserviceMenu?.children?.map((c) => c.value)).toEqual([
      '/admin/subservice/plugin',
      '/admin/subservice/code-sandbox',
      '/admin/subservice/ai-proxy',
      '/admin/subservice/agent-sandbox'
    ]);

    // 验证系统配置包含 9 个二级项
    const systemConfigMenu = menus.find((item) => item.label === '系统配置');
    expect(systemConfigMenu?.children?.length).toBe(9);
  });

  it('hides commercial pay menus when hasPayCapability is false in pro service', () => {
    const menus = getAdminMenuList({ isProService: true, hasPayCapability: false });

    const menuLabels = menus.map((item) => item.label);
    expect(menuLabels).not.toContain('商业化');
    expect(menuLabels).toContain('子服务');
  });

  it('only provides icons for top-level menu items and no icons for sub-menu children', () => {
    const communityMenus = getAdminMenuList({ isProService: false });
    const proMenus = getAdminMenuList({ isProService: true });

    for (const menu of [...communityMenus, ...proMenus]) {
      // 一级菜单必有 icon
      expect(menu.icon).toBeDefined();

      // 子级菜单均不带 icon
      if (menu.children) {
        for (const child of menu.children) {
          expect(child.icon).toBeUndefined();
        }
      }
    }
  });
});
