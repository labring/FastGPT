import { useEffect } from 'react';
import type React from 'react';
import { Box } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import SecondaryNavigationContainer from '@/pageComponents/common/SecondaryNavigationContainer';
import { useAdminMenu } from '@/pageComponents/admin/useAdminMenu';

/**
 * 管理员区域（/admin/*）的二级导航壳层，仅 root 用户可见。
 * 复用 SecondaryNavigationContainer 两级分组侧栏：父级可展开子项，
 * 非 root 访问时重定向回个人中心。
 */
const AdminContainer = ({
  children,
  isLoading
}: {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  const router = useRouter();
  const { initd, licenseLoading } = useSystemStore();
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';

  const currentTab = router.pathname;
  const { menuList } = useAdminMenu();

  // 非 root 访问管理员区域时重定向回个人中心
  useEffect(() => {
    if (!initd || !userInfo || isRoot) return;
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
      tabs={menuList}
      value={currentTab}
      onChange={setCurrentTab}
      mobileScrollPositionKey={'admin-mobile-navigation'}
    >
      {/* 内容区白底铺满：各迁移页面自带内边距，这里不再叠一层灰底与 padding */}
      <Box bg={'white'} h={'100%'} overflow={['auto', 'hidden']}>
        {children}
      </Box>
    </SecondaryNavigationContainer>
  );
};

export default AdminContainer;
