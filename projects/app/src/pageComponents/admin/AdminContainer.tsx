import { useEffect, useMemo } from 'react';
import type React from 'react';
import type { LicenseDataType } from '@fastgpt/global/common/system/types';
import { Box } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import SecondaryNavigationContainer, {
  type SecondaryNavigationTab
} from '@/pageComponents/common/SecondaryNavigationContainer';
import { unlicensedAdminRoutes } from '@/components/admin/constants';
import { isLicenseActive } from '@fastgpt/global/common/system/license/utils';

/**
 * 管理员区域（/admin/*）的二级导航壳层，仅 root 用户可见。
 * 复用 SecondaryNavigationContainer 两级分组侧栏：父级可展开子项，
 * 非 root 访问时重定向回个人中心。
 *
 * 菜单授权（决策版）：
 * - License 未激活：仅展示白名单菜单（系统模型/系统工具/版本升级/License 管理），与 Layout 对 /admin/* 的路由拦截一致
 * - 套餐管理/支付记录/开票/充值 = functions.pay 控制（商业功能，激活且开启才显示）
 * - 系统资源按子项过滤白名单；License 激活后，模板市场不依赖额外功能开关
 */

const AdminContainer = ({
  children,
  isLoading
}: {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  const router = useRouter();
  const { initd, licenseData, licenseLoading } = useSystemStore();
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';

  const currentTab = router.pathname;

  // License 检测完成后无授权数据、或授权已过期 = 不可用；此时仅保留白名单菜单，
  // 避免暴露被 Layout 拦截的路由。已过期的 License 仍在 store 中，必须按有效期判定。
  const licenseUnactivated = useMemo(() => !isLicenseActive(licenseData), [licenseData]);

  // 菜单里的功能开关一律经此处读取：授权不可用时全部按关闭处理，
  // 避免过期 License 的 functions 继续解锁套餐、支付等菜单。
  const licenseCapabilities = useMemo<Partial<LicenseDataType['functions']>>(
    () => (licenseUnactivated ? {} : (licenseData?.functions ?? {})),
    [licenseData, licenseUnactivated]
  );

  const tabList = useMemo<SecondaryNavigationTab<string>[]>(() => {
    const tabs: SecondaryNavigationTab<string>[] = [
      {
        icon: 'common/overviewLight',
        label: '数据面板',
        value: '/admin/dashboard'
      },
      {
        icon: 'support/user/informLight',
        label: '通知管理',
        value: '/admin/inform'
      },
      {
        icon: 'common/administrator',
        label: '用户管理',
        value: '/admin/users',
        children: [
          {
            icon: 'common/userInfo',
            label: '用户信息',
            value: '/admin/users'
          },
          {
            icon: 'support/team/group',
            label: '团队管理',
            value: '/admin/teams'
          },
          ...(licenseCapabilities.pay
            ? [
                {
                  icon: 'support/account/plans',
                  label: '套餐管理',
                  value: '/admin/plans'
                },
                {
                  icon: 'support/bill/payRecordLight',
                  label: '支付记录',
                  value: '/admin/pays'
                },
                {
                  icon: 'common/billing',
                  label: '开票管理',
                  value: '/admin/invoice'
                }
              ]
            : [])
        ]
      },
      {
        icon: 'book',
        label: '用户资源',
        value: '/admin/apps',
        children: [
          {
            icon: 'core/app/aiLightSmall',
            label: '应用管理',
            value: '/admin/apps'
          },
          {
            icon: 'core/dataset/datasetLightSmall',
            label: '知识库管理',
            value: '/admin/datasets'
          }
        ]
      },
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
        icon: 'common/settingLight',
        label: '系统配置',
        value: '/admin/settings/basic',
        children: [
          {
            icon: 'core/workflow/debugResult',
            label: '基础配置',
            value: '/admin/settings/basic'
          },
          {
            icon: 'common/check',
            label: '功能清单',
            value: '/admin/settings/feature'
          },
          {
            icon: 'common/model',
            label: '安全配置',
            value: '/admin/settings/model'
          },
          {
            icon: 'common/thirdParty',
            label: '第三方提供商',
            value: '/admin/settings/thirdParty'
          },
          {
            icon: 'support/user/userLightSmall',
            label: '用户配置',
            value: '/admin/settings/user'
          },
          ...(licenseCapabilities.pay
            ? [
                {
                  icon: 'support/bill/priceLight',
                  label: '套餐 & 充值',
                  value: '/admin/settings/pay'
                }
              ]
            : [])
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
      },
      {
        icon: 'common/wallet',
        label: 'License 管理',
        value: '/admin/license'
      }
    ];

    if (!licenseUnactivated) return tabs;
    // 开源版没有系统资源分组，四个可用入口直接平铺在导航栏中。
    return unlicensedAdminRoutes.flatMap((route) => {
      const tab = tabs.find((item) => item.value === route);
      if (tab) return [tab];
      return tabs.flatMap((item) => item.children?.filter((child) => child.value === route) ?? []);
    });
  }, [licenseCapabilities, licenseUnactivated]);

  // 非 root 访问管理员区域时重定向回个人中心
  useEffect(() => {
    if (!router.isReady || !initd || !userInfo || isRoot) return;
    void router.replace('/account/info');
  }, [initd, isRoot, router, userInfo]);

  const setCurrentTab = (tab: string) => {
    if (tab === currentTab) return;
    void router.push(tab);
  };

  return (
    <SecondaryNavigationContainer
      isLoading={isLoading || !initd || !isRoot}
      isMenuLoading={isRoot && licenseLoading}
      tabs={tabList}
      value={currentTab}
      onChange={setCurrentTab}
      mobileScrollPositionKey={'admin-mobile-navigation'}
    >
      {/* 内容区白底铺满：各迁移页面自带内边距，这里不再叠一层灰底与 padding */}
      <Box bg={'white'} h={'100%'} overflow={'hidden'}>
        {children}
      </Box>
    </SecondaryNavigationContainer>
  );
};

export default AdminContainer;
