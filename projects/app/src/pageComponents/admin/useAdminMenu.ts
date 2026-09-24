import { useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';

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
};

/**
 * 开源社区版（!isProService）允许访问与展示的管理员路由白名单。
 */
export const communityAdminRoutes = [
  '/admin/license',
  '/admin/version',
  '/admin/resources/model',
  '/admin/resources/tool',
  '/admin/migration'
] as const;

/**
 * 开源社区版菜单树：严格仅展示 概览（许可证/系统版本）、系统资源（系统模型/系统工具）、版本升级。
 * 遵循新版 UI 规范：仅一级菜单带有 icon，子级菜单不带 icon。
 */
export const getCommunityAdminMenuList = (): AdminMenuItem[] => [
  {
    icon: 'common/overviewLight',
    label: '概览',
    value: '/admin/license',
    children: [
      {
        label: '许可证',
        value: '/admin/license'
      },
      {
        label: '系统版本',
        value: '/admin/version'
      }
    ]
  },
  {
    icon: 'common/systemResourceLight',
    label: '系统资源',
    value: '/admin/resources/model',
    children: [
      {
        label: '系统模型',
        value: '/admin/resources/model'
      },
      {
        label: '系统工具',
        value: '/admin/resources/tool'
      }
    ]
  },
  {
    icon: 'common/rocket',
    label: '版本升级',
    value: '/admin/migration'
  }
];

/**
 * 商业版完整菜单树（当存在 PRO_URL 时展示）。
 * 遵循新版 UI 规范：仅一级菜单带有 icon，子级菜单不带 icon。
 */
export const getProAdminMenuList = ({
  hasPayCapability = true
}: {
  hasPayCapability?: boolean;
}): AdminMenuItem[] => [
  {
    icon: 'common/overviewLight',
    label: '概览',
    value: '/admin/license',
    children: [
      {
        label: '许可证',
        value: '/admin/license'
      },
      {
        label: '系统版本',
        value: '/admin/version'
      }
    ]
  },
  {
    icon: 'common/dashboardLight',
    label: '数据面板',
    value: '/admin/dashboard'
  },
  {
    icon: 'common/operationLight',
    label: '运营管理',
    value: '/admin/inform',
    children: [
      {
        label: '通知管理',
        value: '/admin/inform'
      }
    ]
  },
  {
    icon: 'common/userGroupLight',
    label: '用户与团队',
    value: '/admin/users',
    children: [
      {
        label: '用户信息',
        value: '/admin/users'
      },
      {
        label: '团队管理',
        value: '/admin/teams'
      }
    ]
  },
  ...(hasPayCapability
    ? [
        {
          icon: 'common/commercialLight',
          label: '商业化',
          value: '/admin/plans',
          isProOnly: true,
          children: [
            {
              label: '套餐管理',
              value: '/admin/plans'
            },
            {
              label: '支付记录',
              value: '/admin/pays'
            },
            {
              label: '开票管理',
              value: '/admin/invoice'
            },
            {
              label: '支付配置',
              value: '/admin/settings/pay'
            }
          ]
        }
      ]
    : []),
  {
    icon: 'common/userResourceLight',
    label: '用户资源',
    value: '/admin/apps',
    children: [
      {
        label: '应用管理',
        value: '/admin/apps'
      },
      {
        label: '知识库管理',
        value: '/admin/datasets'
      }
    ]
  },
  {
    icon: 'common/systemResourceLight',
    label: '系统资源',
    value: '/admin/resources/model',
    children: [
      {
        label: '系统模型',
        value: '/admin/resources/model'
      },
      {
        label: '系统工具',
        value: '/admin/resources/tool'
      },
      {
        label: '应用模板',
        value: '/admin/resources/app_template'
      }
    ]
  },
  {
    icon: 'common/subserviceLight',
    label: '子服务',
    value: '/admin/subservice/plugin',
    isProOnly: true,
    children: [
      {
        label: '插件服务',
        value: '/admin/subservice/plugin'
      },
      {
        label: 'Code Sandbox',
        value: '/admin/subservice/code-sandbox'
      },
      {
        label: 'AI Proxy',
        value: '/admin/subservice/ai-proxy'
      },
      {
        label: 'Agent Sandbox',
        value: '/admin/subservice/agent-sandbox'
      }
    ]
  },
  {
    icon: 'common/systemSettingLight',
    label: '系统配置',
    value: '/admin/settings/site',
    children: [
      {
        label: '站点信息',
        value: '/admin/settings/site'
      },
      {
        label: '功能开关',
        value: '/admin/settings/feature'
      },
      {
        label: '账号与登录',
        value: '/admin/settings/auth'
      },
      {
        label: '安全策略',
        value: '/admin/settings/security'
      },
      {
        label: '资源限制',
        value: '/admin/settings/resource'
      },
      {
        label: '性能与并发',
        value: '/admin/settings/performance'
      },
      {
        label: '文件与存储策略',
        value: '/admin/settings/storage'
      },
      {
        label: '向量检索策略',
        value: '/admin/settings/vector'
      },
      {
        label: '外部提供商',
        value: '/admin/settings/providers'
      }
    ]
  },
  {
    icon: 'common/rocket',
    label: '版本升级',
    value: '/admin/migration'
  },
  {
    icon: 'common/audit',
    label: '审计日志',
    value: '/admin/audit'
  }
];

/**
 * 纯函数：根据环境配置（尤其是是否部署商业版 PRO_URL）解析并返回 /admin 菜单树。
 */
export const getAdminMenuList = ({
  isProService,
  hasPayCapability = true
}: GetAdminMenuListParams): AdminMenuItem[] => {
  if (!isProService) {
    return getCommunityAdminMenuList();
  }

  return getProAdminMenuList({ hasPayCapability });
};

/**
 * React Hook：供 /admin 页面二级导航消费的菜单数据。
 * 商业版判断条件严格根据是否存在 PRO_URL（即 feConfigs.isProService），而非是否在 License 激活中。
 */
export const useAdminMenu = () => {
  const { feConfigs, licenseData } = useSystemStore();

  // 商业版判断：根据 PRO_URL 是否存在（即 feConfigs?.isProService）
  const isPro = !!feConfigs?.isProService;

  // 商业版环境下具备支付管理能力（如有 licenseData 则兼顾其配置）
  const hasPayCapability = isPro && (licenseData?.functions?.pay ?? true);

  const menuList = useMemo(() => {
    return getAdminMenuList({
      isProService: isPro,
      hasPayCapability
    });
  }, [isPro, hasPayCapability]);

  return {
    isPro,
    menuList
  };
};
