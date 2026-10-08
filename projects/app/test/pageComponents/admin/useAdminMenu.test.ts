import { describe, expect, it } from 'vitest';
import {
  getAdminDefaultRoute,
  getAdminMenuList,
  communityAdminRoutes
} from '@/pageComponents/admin/useAdminMenu';

describe('getAdminMenuList', () => {
  it('returns only community allowed menu items when isProService is false', () => {
    const menus = getAdminMenuList({ isProService: false });

    const topLabels = menus.map((item) => item.label);

    // 开源版仅可见：系统概览、系统资源、版本升级
    expect(topLabels).toEqual(['系统概览', '系统资源', '版本升级']);

    // 系统概览为单级菜单，无子项
    const overviewMenu = menus.find((item) => item.label === '系统概览');
    expect(overviewMenu?.value).toBe('/admin/license');
    expect(overviewMenu?.children).toBeUndefined();

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
      '/admin/subservice/agent-sandbox',
      '/admin/subservice/mcp'
    ]);

    // 验证系统配置的二级项：「资源限制」+「性能与并发」合并为「限制与并发」，
    // 移除「向量检索策略」（量化等级改环境变量、HNSW 并入限制与并发）
    const systemConfigMenu = menus.find((item) => item.label === '系统配置');
    const settingsValues = systemConfigMenu?.children?.map((c) => c.value) ?? [];
    expect(systemConfigMenu?.children?.length).toBe(7);
    expect(settingsValues).toContain('/admin/settings/core');
    expect(settingsValues).toContain('/admin/settings/limits');
    expect(settingsValues).not.toContain('/admin/settings/resource');
    expect(settingsValues).not.toContain('/admin/settings/performance');
    expect(settingsValues).not.toContain('/admin/settings/vector');
    // 「文件与存储策略」已合并进「限制与并发」，不再单独占菜单项
    expect(settingsValues).not.toContain('/admin/settings/storage');
  });

  it('hides commercial pay menus when hasPayCapability is false in pro service', () => {
    const menus = getAdminMenuList({ isProService: true, hasPayCapability: false });

    const menuLabels = menus.map((item) => item.label);
    expect(menuLabels).not.toContain('商业化');
    expect(menuLabels).toContain('子服务');
  });

  it('degrades to whitelist menu when pro license is inactive or expired', () => {
    // License 未激活/已过期：菜单必须与 Layout 路由拦截保持一致，只留白名单入口，
    // 避免「商业化等菜单可见但点击被弹回 /admin/license」
    const menus = getAdminMenuList({
      isProService: true,
      hasPayCapability: true,
      licenseActive: false
    });

    const menuLabels = menus.map((item) => item.label);
    expect(menuLabels).toEqual(['系统概览', '系统资源', '版本升级']);
    expect(menuLabels).not.toContain('商业化');
    expect(menuLabels).not.toContain('子服务');
    expect(menuLabels).not.toContain('数据面板');
    expect(menuLabels).not.toContain('系统配置');

    // 降级后的叶子路由与社区版白名单严格一致
    const renderedRoutes = menus.flatMap((item) =>
      item.children && item.children.length > 0 ? item.children.map((c) => c.value) : [item.value]
    );
    expect(renderedRoutes).toEqual(communityAdminRoutes);
  });

  it('keeps the full pro menu when licenseActive defaults to true', () => {
    // 不传 licenseActive 的调用（如默认参数）保持商业版完整菜单
    const menus = getAdminMenuList({ isProService: true });
    expect(menus.map((item) => item.label)).toContain('商业化');
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

describe('getAdminDefaultRoute', () => {
  it('opens the license page on community deployments regardless of license state', () => {
    // 社区版没有数据面板与商业能力：无论是否携带 License，都落在许可证页
    expect(getAdminDefaultRoute({ isProService: false, isLicenseActive: false })).toBe(
      '/admin/license'
    );
    expect(getAdminDefaultRoute({ isProService: false, isLicenseActive: true })).toBe(
      '/admin/license'
    );
  });

  it('opens the dashboard only when pro service is deployed and the license is active', () => {
    expect(getAdminDefaultRoute({ isProService: true, isLicenseActive: true })).toBe(
      '/admin/dashboard'
    );
  });

  it('falls back to the license page when the pro license is missing or expired', () => {
    // 未激活/已过期时许可证页是激活与续期入口
    expect(getAdminDefaultRoute({ isProService: true, isLicenseActive: false })).toBe(
      '/admin/license'
    );
  });
});
