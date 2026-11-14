import { useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { isLicenseActive } from '@fastgpt/global/common/system/license/utils';
import { isRouteVisible } from './utils';

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
   * 配置页面按部署版本开放；商业业务页面需要有效 License，与 Layout 路由拦截保持一致。
   */
  licenseActive?: boolean;
  /** 是否开启 SaaS 运营专用配置项展示（默认 false） */
  enableSaasAdminConfig?: boolean;
  /** 可选的国际化翻译函数 */
  t?: MenuTranslateFn;
};

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
  menu_subservice_code_sandbox: 'admin:menu_subservice_code_sandbox',
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
  menu_moderation: 'admin:menu_moderation',
  menu_moderation_policy: 'admin:menu_moderation_policy',
  menu_audit_log: 'admin:menu_audit_log'
} as const;

type AdminMenuKey = keyof typeof ADMIN_MENU_I18N_KEYS;

const createLabelGetter = (t?: MenuTranslateFn) => (key: AdminMenuKey, fallback: string) =>
  t ? t(ADMIN_MENU_I18N_KEYS[key]) : fallback;

/**
 * 根据环境配置、版本归属以及所管理字段的实际可见数，动态解析并返回 /admin 菜单树。
 * 遵循新版 UI 规范：
 * - 仅一级菜单带有 icon，子级菜单不带 icon；
 * - 配置/子服务页面按所声明字段的实际可见数量判定，可见字段为 0 时自动隐藏；
 * - 子项全隐藏的父菜单同步隐藏，空父级不保留空壳；
 * - 不再维护死名单，由字段元数据自动推导。
 */
export const getAdminMenuList = (params: GetAdminMenuListParams): AdminMenuItem[] => {
  const lbl = createLabelGetter(params.t);
  const options = {
    isProService: params.isProService,
    hasPayCapability: params.hasPayCapability ?? true,
    licenseActive: params.licenseActive ?? true,
    enableSaasAdminConfig: params.enableSaasAdminConfig ?? false
  };

  const rawMenuTree: AdminMenuItem[] = [
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
    },
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
      value: '/admin/subservice/code-sandbox',
      children: [
        {
          label: lbl('menu_subservice_code_sandbox', 'Code Sandbox'),
          value: '/admin/subservice/code-sandbox'
        },
        {
          label: lbl('menu_subservice_agent_sandbox', 'Agent Sandbox'),
          value: '/admin/subservice/agent-sandbox'
        },
        {
          label: lbl('menu_subservice_mcp', 'MCP SSE 服务'),
          value: '/admin/subservice/mcp'
        }
      ]
    },
    {
      icon: 'common/systemSettingLight',
      label: lbl('menu_system_settings', '系统配置'),
      value: '/admin/settings/core',
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
      icon: 'support/bill/payRecordLight',
      label: lbl('menu_moderation', '内容审核'),
      value: '/admin/moderation/policy',
      isProOnly: true,
      children: [
        {
          label: lbl('menu_moderation_policy', '审核策略配置'),
          value: '/admin/moderation/policy'
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

  return rawMenuTree
    .map((item) => {
      if (item.children && item.children.length > 0) {
        const visibleChildren = item.children.filter((child) =>
          isRouteVisible(child.value, options)
        );
        if (visibleChildren.length === 0) return null;
        return {
          ...item,
          value: visibleChildren[0].value,
          children: visibleChildren
        };
      }
      return isRouteVisible(item.value, options) ? item : null;
    })
    .filter((item): item is AdminMenuItem => item !== null);
};

export const getCommunityAdminMenuList = (options?: { t?: MenuTranslateFn }): AdminMenuItem[] =>
  getAdminMenuList({ isProService: false, t: options?.t });

export const getProAdminMenuList = ({
  hasPayCapability = true,
  t
}: {
  hasPayCapability?: boolean;
  t?: MenuTranslateFn;
} = {}): AdminMenuItem[] => getAdminMenuList({ isProService: true, hasPayCapability, t });

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
  const enableSaasAdminConfig = !!feConfigs?.enableSaasAdminConfig;

  const menuList = useMemo(() => {
    return getAdminMenuList({
      isProService: isPro,
      hasPayCapability,
      licenseActive,
      enableSaasAdminConfig,
      t
    });
  }, [isPro, hasPayCapability, licenseActive, enableSaasAdminConfig, t]);

  return {
    isPro,
    menuList
  };
};
