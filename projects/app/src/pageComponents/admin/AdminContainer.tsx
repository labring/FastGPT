import { useEffect, useMemo } from 'react';
import type React from 'react';
import { Box } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import SecondaryNavigationContainer, {
  type SecondaryNavigationTab
} from '@/pageComponents/common/SecondaryNavigationContainer';

/**
 * 管理员区域（/admin/*）的二级导航壳层，仅 root 用户可见。
 * 复用 SecondaryNavigationContainer 两级分组侧栏：父级可展开子项，
 * 非 root 访问时重定向回个人中心。
 *
 * 注：app 侧暂无 License 系统，pay/customTemplates 相关菜单默认隐藏；
 * 后续商业版接入 license 时替换为真实 licenseData。
 */
const adminLicenseFunctions = {
  pay: false,
  customTemplates: false
};

const AdminContainer = ({
  children,
  isLoading
}: {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  const router = useRouter();
  const { initd } = useSystemStore();
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';

  const currentTab = router.pathname;

  const tabList = useMemo<SecondaryNavigationTab<string>[]>(
    () => [
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
        icon: 'core/app/logsLight',
        label: '日志管理',
        value: '/admin/log'
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
          ...(adminLicenseFunctions.pay
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
        label: '资源管理',
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
        icon: 'common/settingLight',
        label: '系统配置',
        value: '/admin/config/basic',
        children: [
          {
            icon: 'core/workflow/debugResult',
            label: '基础配置',
            value: '/admin/config/basic'
          },
          {
            icon: 'common/check',
            label: '功能清单',
            value: '/admin/config/feature'
          },
          {
            icon: 'common/model',
            label: '安全配置',
            value: '/admin/config/model'
          },
          {
            icon: 'common/thirdParty',
            label: '第三方提供商',
            value: '/admin/config/thirdParty'
          },
          {
            icon: 'support/user/userLightSmall',
            label: '用户配置',
            value: '/admin/config/user'
          },
          ...(adminLicenseFunctions.pay
            ? [
                {
                  icon: 'support/bill/priceLight',
                  label: '套餐 & 充值',
                  value: '/admin/config/pay'
                }
              ]
            : [])
        ]
      },
      {
        icon: 'common/toolkit',
        label: '系统工具',
        value: '/admin/config/plugin'
      },
      {
        icon: 'common/model',
        label: '模型提供商',
        value: '/admin/config/modelProvider'
      },
      ...(adminLicenseFunctions.customTemplates
        ? [
            {
              icon: 'common/layer',
              label: '模板 & 工具',
              value: '/admin/templates/app',
              children: [
                {
                  icon: 'common/templateMarket',
                  label: '模板市场',
                  value: '/admin/templates/app'
                },
                {
                  icon: 'common/toolkit',
                  label: '工具箱',
                  value: '/admin/templates/toolkit'
                }
              ]
            }
          ]
        : []),
      {
        icon: 'common/audit',
        label: '审计日志',
        value: '/admin/audit'
      },
      {
        icon: 'common/overviewLight',
        label: '管理员主页',
        value: '/admin/home'
      }
    ],
    []
  );

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
      tabs={tabList}
      value={currentTab}
      onChange={setCurrentTab}
      mobileScrollPositionKey={'admin-mobile-navigation'}
    >
      {/* 内容区使用浅灰底，让迁移页面的 BoxCard 白卡片自然浮起（对齐 pro/admin 视觉） */}
      <Box bg={'myGray.100'} h={'100%'} p={[0, 4]} overflow={'auto'}>
        {children}
      </Box>
    </SecondaryNavigationContainer>
  );
};

export default AdminContainer;
