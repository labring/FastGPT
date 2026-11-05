import { describe, expect, it } from 'vitest';
import { getAdminDefaultRoute, getAdminMenuList } from '@/pageComponents/admin/useAdminMenu';
import { isConfigFieldVisible } from '@fastgpt/global/common/system/config/permission';

describe('getAdminMenuList', () => {
  it('dynamically hides menus with zero visible fields in community edition', () => {
    const menus = getAdminMenuList({ isProService: false });

    const topLabels = menus.map((item) => item.label);

    // 开源社区版：系统概览、系统资源、系统配置（含开源字段）、版本升级可见；
    // 商业化、子服务等全为商业字段的分组自动隐藏，不再单独维护固定白名单。
    expect(topLabels).toEqual(['系统概览', '系统资源', '系统配置', '版本升级']);

    // 系统概览为单级菜单，无子项
    const overviewMenu = menus.find((item) => item.label === '系统概览');
    expect(overviewMenu?.value).toBe('/admin/license');
    expect(overviewMenu?.children).toBeUndefined();

    // 系统资源子菜单：仅系统模型、系统工具（应用模板为商业版特性不可见）
    const resourceMenu = menus.find((item) => item.label === '系统资源');
    expect(resourceMenu?.children?.map((c) => c.value)).toEqual([
      '/admin/resources/model',
      '/admin/resources/tool'
    ]);

    // 系统配置：包含 7 个含开源字段的配置页（支付配置 pay 页面全为商业字段，自动隐藏）
    const systemConfigMenu = menus.find((item) => item.label === '系统配置');
    expect(systemConfigMenu?.children?.map((c) => c.value)).toEqual([
      '/admin/settings/core',
      '/admin/settings/site',
      '/admin/settings/feature',
      '/admin/settings/auth',
      '/admin/settings/security',
      '/admin/settings/limits',
      '/admin/settings/providers'
    ]);

    // 版本升级
    const migrationMenu = menus.find((item) => item.label === '版本升级');
    expect(migrationMenu?.value).toBe('/admin/migration');

    // 确认商业化、子服务（全为 pro 字段）、数据面板等均自动隐藏
    expect(topLabels).not.toContain('商业化');
    expect(topLabels).not.toContain('子服务');
    expect(topLabels).not.toContain('数据面板');
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

  it('keeps payment configuration available without licensed payment business', () => {
    const menus = getAdminMenuList({ isProService: true, hasPayCapability: false });

    const menuLabels = menus.map((item) => item.label);
    expect(
      menus.find((menu) => menu.label === '商业化')?.children?.map((item) => item.value)
    ).toEqual(['/admin/settings/pay']);
    expect(menuLabels).toContain('子服务');
  });

  it('hides commercial business menus when pro license is inactive or expired', () => {
    // License 未激活/已过期：商业版业务菜单隐藏，仅保留基础管理和系统配置入口
    const menus = getAdminMenuList({
      isProService: true,
      hasPayCapability: true,
      licenseActive: false
    });

    const menuLabels = menus.map((item) => item.label);
    expect(menuLabels).toContain('系统概览');
    expect(menuLabels).toContain('系统资源');
    expect(menuLabels).toContain('系统配置');
    expect(menuLabels).toContain('版本升级');
    expect(
      menus.find((menu) => menu.label === '商业化')?.children?.map((item) => item.value)
    ).toEqual(['/admin/settings/pay']);
    expect(menuLabels).toContain('子服务');
    expect(menuLabels).not.toContain('数据面板');
    expect(menuLabels).not.toContain('运营管理');
  });

  it('controls SaaS operational fields visibility via enableSaasAdminConfig', () => {
    // 优惠券、对公表单在私有化（enableSaasAdminConfig=false）下不可见
    expect(
      isConfigFieldVisible('commercial.showCoupon', {
        edition: 'pro',
        enableSaasAdminConfig: false
      })
    ).toBe(false);
    expect(
      isConfigFieldVisible('commercial.payFormUrl', {
        edition: 'pro',
        enableSaasAdminConfig: false
      })
    ).toBe(false);

    // 开启 SaaS 后可见
    expect(
      isConfigFieldVisible('commercial.showCoupon', {
        edition: 'pro',
        enableSaasAdminConfig: true
      })
    ).toBe(true);
    expect(
      isConfigFieldVisible('commercial.payFormUrl', {
        edition: 'pro',
        enableSaasAdminConfig: true
      })
    ).toBe(true);

    // 支付凭据在私有化和 SaaS 均可见（非 SaaS 独占）
    expect(
      isConfigFieldVisible('commercial.payment.wx.appId', {
        edition: 'pro',
        enableSaasAdminConfig: false
      })
    ).toBe(true);
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
