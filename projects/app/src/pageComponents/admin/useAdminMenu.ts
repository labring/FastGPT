import { useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { isLicenseActive } from '@fastgpt/global/common/system/license/utils';

/**
 * 二级子菜单项定义。
 * 遵循新版 UI 规范：仅一级菜单带有 icon，子级菜单无需 icon。
 */
export type AdminSubMenuItem = {
  label: string;
  value: string;
  icon?: string;
  isProOnly?: boolean;
};

/**
 * 一级菜单项定义。
 */
export type AdminMenuItem = {
  icon: string;
  label: string;
  value: string;
  id?: string;
  isProOnly?: boolean;
  children?: AdminSubMenuItem[];
};

export type MenuTranslateFn = (key: string) => string;

export type GetAdminMenuListParams = {
  /**
   * 是否为商业版部署。
   * 判定规则：严格以是否存在 PRO_URL（即 feConfigs.isProService）为准，而非 License 激活状态。
   */
  isProService: boolean;
  /**
   * 是否开启支付与商业化菜单能力（可选，商业版环境下默认生效）。
   */
  hasPayCapability?: boolean;
  /**
   * License 是否处于可授权状态（可选，默认生效）。
   * 商业版部署下 License 未激活/已过期时菜单降级为白名单入口，与 Layout 路由拦截保持一致。
   */
  licenseActive?: boolean;
  /** 可选的国际化翻译函数 */
  t?: MenuTranslateFn;
};

/**
 * 开源社区版（!isProService）允许访问与展示的管理员路由白名单。
 */
export const communityAdminRoutes = [
  '/admin/license',
  '/admin/resources/model',
  '/admin/resources/tool',
  '/admin/migration'
] as const;

// 静态声明每个菜单项对应的完整 i18n key，避免动态拼接（'admin:' + key）导致静态扫描脚本无法提取
const ADMIN_MENU_I18N_KEYS = {
  menu_overview: 'admin:menu_overview',
  menu_system_resources: 'admin:menu_system_resources',
  menu_models: 'admin:menu_models',
  menu_tools: 'admin:menu_tools',
  menu_migration: 'admin:menu_migration',
  menu_dashboard: 'admin:menu_dashboard',
  menu_operation: 'admin:menu_operation',
  menu_inform: 'admin:menu_inform',
  menu_user_team: 'admin:menu_user_team',
  menu_users: 'admin:menu_users',
  menu_teams: 'admin:menu_teams',
  menu_commercial: 'admin:menu_commercial',
  menu_plans: 'admin:menu_plans',
  menu_pays: 'admin:menu_pays',
  menu_invoice: 'admin:menu_invoice',
  menu_pay_settings: 'admin:menu_pay_settings',
  menu_user_resources: 'admin:menu_user_resources',
  menu_apps: 'admin:menu_apps',
  menu_datasets: 'admin:menu_datasets',
  menu_app_templates: 'admin:menu_app_templates',
  menu_subservices: 'admin:menu_subservices',
  menu_subservice_plugin: 'admin:menu_subservice_plugin',
  menu_subservice_code_sandbox: 'admin:menu_subservice_code_sandbox',
  menu_subservice_ai_proxy: 'admin:menu_subservice_ai_proxy',
  menu_subservice_agent_sandbox: 'admin:menu_subservice_agent_sandbox',
  menu_subservice_mcp: 'admin:menu_subservice_mcp',
  menu_system_settings: 'admin:menu_system_settings',
  menu_setting_core: 'admin:menu_setting_core',
  menu_setting_site: 'admin:menu_setting_site',
  menu_setting_feature: 'admin:menu_setting_feature',
  menu_setting_auth: 'admin:menu_setting_auth',
  menu_setting_security: 'admin:menu_setting_security',
  menu_setting_limits: 'admin:menu_setting_limits',
  menu_setting_providers: 'admin:menu_setting_providers',
  menu_audit_log: 'admin:menu_audit_log'
} as const;

type AdminMenuKey = keyof typeof ADMIN_MENU_I18N_KEYS;

const createLabelGetter = (t?: MenuTranslateFn) => (key: AdminMenuKey, fallback: string) =>
  t ? t(ADMIN_MENU_I18N_KEYS[key]) : fallback;

/**
 * 开源社区版菜单树：严格仅展示 系统概览、系统资源（系统模型/系统工具）、版本升级。
 * 遵循新版 UI 规范：仅一级菜单带有 icon，子级菜单不带 icon。
 * 版本信息已并入系统概览页，不再单独占用菜单项。
 */
export const getCommunityAdminMenuList = (options?: { t?: MenuTranslateFn }): AdminMenuItem[] => {
  const lbl = createLabelGetter(options?.t);
  return [
    {
      icon: 'common/overviewLight',
      label: lbl('menu_overview', '系统概览'),
      value: '/admin/license'
    },
    {
      icon: 'common/systemResourceLight',
      label: lbl('menu_system_resources', '系统资源'),
      value: '/admin/resources/model',
      children: [
        {
          label: lbl('menu_models', '系统模型'),
          value: '/admin/resources/model'
        },
        {
          label: lbl('menu_tools', '系统工具'),
          value: '/admin/resources/tool'
        }
      ]
    },
    {
      icon: 'common/rocket',
      label: lbl('menu_migration', '版本升级'),
      value: '/admin/migration'
    }
  ];
};

/**
 * 商业版完整菜单树（当存在 PRO_URL 时展示）。
 * 遵循新版 UI 规范：仅一级菜单带有 icon，子级菜单不带 icon。
 */
export const getProAdminMenuList = ({
  hasPayCapability = true,
  t
}: {
  hasPayCapability?: boolean;
  t?: MenuTranslateFn;
} = {}): AdminMenuItem[] => {
  const lbl = createLabelGetter(t);
  return [
    {
      icon: 'common/dashboardLight',
      label: lbl('menu_dashboard', '数据面板'),
      value: '/admin/dashboard'
    },

    {
      icon: 'common/overviewLight',
      label: lbl('menu_overview', '系统概览'),
      value: '/admin/license'
    },

    {
      icon: 'common/operationLight',
      label: lbl('menu_operation', '运营管理'),
      value: '/admin/inform',
      children: [
        {
          label: lbl('menu_inform', '通知管理'),
          value: '/admin/inform'
        }
      ]
    },
    {
      icon: 'common/userGroupLight',
      label: lbl('menu_user_team', '用户与团队'),
      value: '/admin/users',
      children: [
        {
          label: lbl('menu_users', '用户信息'),
          value: '/admin/users'
        },
        {
          label: lbl('menu_teams', '团队管理'),
          value: '/admin/teams'
        }
      ]
    },
    ...(hasPayCapability
      ? [
          {
            icon: 'common/commercialLight',
            label: lbl('menu_commercial', '商业化'),
            value: '/admin/plans',
            isProOnly: true,
            children: [
              {
                label: lbl('menu_plans', '套餐管理'),
                value: '/admin/plans'
              },
              {
                label: lbl('menu_pays', '支付记录'),
                value: '/admin/pays'
              },
              {
                label: lbl('menu_invoice', '开票管理'),
                value: '/admin/invoice'
              },
              {
                label: lbl('menu_pay_settings', '支付配置'),
                value: '/admin/settings/pay'
              }
            ]
          }
        ]
      : []),
    {
      icon: 'common/userResourceLight',
      label: lbl('menu_user_resources', '用户资源'),
      value: '/admin/apps',
      children: [
        {
          label: lbl('menu_apps', '应用管理'),
          value: '/admin/apps'
        },
        {
          label: lbl('menu_datasets', '知识库管理'),
          value: '/admin/datasets'
        }
      ]
    },
    {
      icon: 'common/systemResourceLight',
      label: lbl('menu_system_resources', '系统资源'),
      value: '/admin/resources/model',
      children: [
        {
          label: lbl('menu_models', '系统模型'),
          value: '/admin/resources/model'
        },
        {
          label: lbl('menu_tools', '系统工具'),
          value: '/admin/resources/tool'
        },
        {
          label: lbl('menu_app_templates', '应用模板'),
          value: '/admin/resources/app_template'
        }
      ]
    },
    {
      icon: 'common/subserviceLight',
      label: lbl('menu_subservices', '子服务'),
      value: '/admin/subservice/plugin',
      isProOnly: true,
      children: [
        {
          label: lbl('menu_subservice_plugin', '插件服务'),
          value: '/admin/subservice/plugin'
        },
        {
          label: lbl('menu_subservice_code_sandbox', 'Code Sandbox'),
          value: '/admin/subservice/code-sandbox'
        },
        {
          label: lbl('menu_subservice_ai_proxy', 'AI Proxy'),
          value: '/admin/subservice/ai-proxy'
        },
        {
          label: lbl('menu_subservice_agent_sandbox', 'Agent Sandbox'),
          value: '/admin/subservice/agent-sandbox'
        },
        {
          label: lbl('menu_subservice_mcp', 'MCP 服务'),
          value: '/admin/subservice/mcp'
        }
      ]
    },
    {
      icon: 'common/systemSettingLight',
      label: lbl('menu_system_settings', '系统配置'),
      value: '/admin/settings/site',
      children: [
        {
          label: lbl('menu_setting_core', '核心配置'),
          value: '/admin/settings/core'
        },
        {
          label: lbl('menu_setting_site', '站点信息'),
          value: '/admin/settings/site'
        },
        {
          label: lbl('menu_setting_feature', '功能开关'),
          value: '/admin/settings/feature'
        },
        {
          label: lbl('menu_setting_auth', '账号与登录'),
          value: '/admin/settings/auth'
        },
        {
          label: lbl('menu_setting_security', '安全策略'),
          value: '/admin/settings/security'
        },
        {
          label: lbl('menu_setting_limits', '限制与并发'),
          value: '/admin/settings/limits'
        },
        {
          label: lbl('menu_setting_providers', '外部提供商'),
          value: '/admin/settings/providers'
        }
      ]
    },
    {
      icon: 'common/rocket',
      label: lbl('menu_migration', '版本升级'),
      value: '/admin/migration'
    },
    {
      icon: 'common/audit',
      label: lbl('menu_audit_log', '审计日志'),
      value: '/admin/audit'
    }
  ];
};

/**
 * 纯函数：根据环境配置（尤其是是否部署商业版 PRO_URL）解析并返回 /admin 菜单树。
 */
export const getAdminMenuList = ({
  isProService,
  hasPayCapability = true,
  licenseActive = true,
  t
}: GetAdminMenuListParams): AdminMenuItem[] => {
  if (!isProService) {
    return getCommunityAdminMenuList({ t });
  }

  // 未激活/已过期：Layout 会把白名单外的 /admin/* 弹回 /admin/license，
  // 菜单同步降级为社区版白名单入口，避免「可见但点击即回跳」的不一致。
  if (!licenseActive) {
    return getCommunityAdminMenuList({ t });
  }

  return getProAdminMenuList({ hasPayCapability, t });
};

/**
 * 纯函数：解析访问 /admin 时的默认落地页。
 *
 * 只有「商业版部署且 License 处于可授权状态」才进数据面板；
 * 社区版没有数据面板与商业能力，未激活/已过期时许可证页既是唯一可用入口也是激活入口。
 */
export const getAdminDefaultRoute = ({
  isProService,
  isLicenseActive
}: {
  isProService: boolean;
  isLicenseActive: boolean;
}): string => {
  return isProService && isLicenseActive ? '/admin/dashboard' : '/admin/license';
};

/**
 * React Hook：供 /admin 页面二级导航消费的菜单数据。
 * 商业版判断条件严格根据是否存在 PRO_URL（即 feConfigs.isProService），而非是否在 License 激活中。
 */
export const useAdminMenu = () => {
  const { feConfigs, licenseData } = useSystemStore();
  const { t } = useSafeTranslation();

  // 商业版判断：根据 PRO_URL 是否存在（即 feConfigs?.isProService）
  const isPro = !!feConfigs?.isProService;

  // License 有效性：未激活/已过期的 License 仍在 store 中，functions.pay 可能仍为 true，
  // 必须按有效期判定，避免展示会被 Layout 路由拦截弹回的商业化菜单。
  const licenseActive = useMemo(() => isLicenseActive(licenseData), [licenseData]);

  // 商业版且授权有效时，再按 License functions 决定支付能力（授权不可用时 functions 一律视为关闭）
  const hasPayCapability = isPro && licenseActive && (licenseData?.functions?.pay ?? true);

  const menuList = useMemo(() => {
    return getAdminMenuList({
      isProService: isPro,
      hasPayCapability,
      licenseActive,
      t
    });
  }, [isPro, hasPayCapability, licenseActive, t]);

  return {
    isPro,
    menuList
  };
};
