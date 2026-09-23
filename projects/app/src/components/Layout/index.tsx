import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getUnreadCount } from '@/web/support/user/inform/api';
import dynamic from 'next/dynamic';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';

import Auth from './auth';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useCheckCoupon } from './hooks/checkCoupon';
import SupportBot from './SupportBot';
import { getAdminModelConfig } from '@/web/core/ai/config';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { unlicensedAdminRoutes } from '@/components/admin/constants';
import { isLicenseActive } from '@fastgpt/global/common/system/license/utils';

const Navbar = dynamic(() => import('./navbar'));
const NavbarPhone = dynamic(() => import('./navbarPhone'));

const NotSufficientModal = dynamic(() => import('@/components/support/wallet/NotSufficientModal'), {
  ssr: false
});
const ManualCopyModal = dynamic(
  () => import('@fastgpt/web/hooks/useCopyData').then((mod) => mod.ManualCopyModal),
  { ssr: false }
);
const PostLoginActionOrchestrator = dynamic(() => import('./PostLoginActionOrchestrator'), {
  ssr: false
});
const ProModal = dynamic(() => import('@/components/ProTip/ProModal'), {
  ssr: false
});
const pcUnShowLayoutRoute: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/login/fastlogin': true,
  '/account/cancel': true,
  '/chat/share': true,
  '/app/edit': true,
  '/chat': true,
  '/tools/price': true,
  '/price': true,
  '/skill/detail': true,
  '/dashboard/tool/marketplace': true
};
const phoneUnShowLayoutRoute: Record<string, boolean> = {
  '/': true,
  '/login': true,
  '/login/provider': true,
  '/login/fastlogin': true,
  '/account/cancel': true,
  '/chat': true,
  '/chat/share': true,
  '/tools/price': true,
  '/price': true,
  '/skill/detail': true,
  '/dashboard/tool/marketplace': true
};

export const navbarWidth = '64px';

const Layout = ({ children }: { children: JSX.Element }) => {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useSafeTranslation();
  const { Loading } = useLoading();
  const {
    setLastRoute,
    loading,
    feConfigs,
    showProModal,
    setShowProModal,
    licenseData,
    licenseLoading,
    initLicenseData
  } = useSystemStore();
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();
  const modelLoginGeneration = useUserModelStore((state) => state.loginGeneration);
  const { setUserDefaultLng, setShareDefaultLng } = useI18nLng();
  const checkedModelIdentityRef = useRef<string>();

  const isRoot = userInfo?.username === 'root';
  // /admin 区域外的路由（工作台、知识库、对话等）属于开源版本体，不受 License 状态影响
  const isAdminRoute = router.pathname.startsWith('/admin/');

  useEffect(() => {
    if (!userInfo || !isRoot) return;
    void initLicenseData();
  }, [initLicenseData, isRoot, userInfo]);

  // License 未激活或已过期时仅限制管理员区域：
  // 白名单（管理员主页/模型提供商/系统工具）之外的 /admin/* 回到管理员主页引导激活或续期。
  // 只判断 licenseData 是否存在不够：已过期的 License 仍在 store 中，会继续放行全部菜单。
  const isLicenseValid = useMemo(() => isLicenseActive(licenseData), [licenseData]);
  useEffect(() => {
    if (
      !router.isReady ||
      !isRoot ||
      licenseLoading ||
      isLicenseValid ||
      !isAdminRoute ||
      unlicensedAdminRoutes.includes(router.pathname)
    ) {
      return;
    }
    void router.replace('/admin/license');
  }, [isAdminRoute, isRoot, isLicenseValid, licenseLoading, router]);

  // Auto redeem coupon
  useCheckCoupon();

  const isChatPage = useMemo(
    () => router.pathname === '/chat' && Object.values(router.query).join('').length !== 0,
    [router.pathname, router.query]
  );
  const isHideNavbar = !!pcUnShowLayoutRoute[router.pathname];

  const {
    data,
    refetch: refetchUnRead,
    isFetched: unreadQueryFetched,
    isError: unreadQueryError
  } = useQuery(['getUnreadCount', userInfo?._id], getUnreadCount, {
    enabled: !!userInfo && !!feConfigs.isPlus,
    refetchInterval: 30000
  });
  const isUnreadDataError = unreadQueryError || data === undefined || data === 0;
  const unread = data !== 0 ? (data?.unReadCount ?? 0) : 0;
  const importantInforms = data !== 0 ? (data?.importantInforms ?? []) : [];

  const syncDefaultLanguage =
    router.pathname === '/chat/share' ? setShareDefaultLng : setUserDefaultLng;

  useEffect(() => {
    void syncDefaultLanguage();
  }, [syncDefaultLanguage]);

  // 仅 root 使用管理员模型列表检查一次系统模型配置，不触发用户模型目录加载。
  useEffect(() => {
    if (userInfo?.username !== 'root') return;
    // 模型配置页会自行加载同一份数据；这里跳过，避免首屏重复请求。
    if (router.pathname === '/admin/resources/model') return;

    const identity = `${userInfo.team.teamId}:${userInfo.team.tmbId}:${modelLoginGeneration}`;
    if (checkedModelIdentityRef.current === identity) return;
    checkedModelIdentityRef.current = identity;

    getAdminModelConfig()
      .then((adminModelConfig) => {
        const activeModels = adminModelConfig.models.filter((model) => model.isActive);
        if (!activeModels.some((model) => model.type === ModelTypeEnum.llm)) {
          toast({
            status: 'warning',
            title: t('common:llm_model_not_config')
          });
          if (router.pathname !== '/admin/resources/model') {
            router.push('/admin/resources/model?modelTab=config');
          }
        } else if (!activeModels.some((model) => model.type === ModelTypeEnum.embedding)) {
          toast({
            status: 'warning',
            title: t('common:embedding_model_not_config')
          });
          if (router.pathname !== '/admin/resources/model') {
            router.push('/admin/resources/model?modelTab=config');
          }
        }
      })
      .catch(() => {
        // 请求失败时允许后续依赖变化再次检查。
        if (checkedModelIdentityRef.current === identity) {
          checkedModelIdentityRef.current = undefined;
        }
      });
  }, [modelLoginGeneration, router, router.pathname, t, toast, userInfo]);

  // Route watch
  useEffect(() => {
    setLastRoute(router.pathname);
  }, [router.pathname, setLastRoute]);

  // 注销用户 - 自动跳转注销页
  useEffect(() => {
    if (
      userInfo?.team?.accountCancellation &&
      router.pathname !== '/account/cancel' &&
      router.pathname !== '/login' &&
      router.pathname !== '/login/provider'
    ) {
      router.replace('/account/cancel?view=team');
    }
  }, [router, userInfo?.team?.accountCancellation]);

  const showPcNavbar = isPc === true && !isHideNavbar;
  const showPhoneNavbar =
    isPc === false && !(phoneUnShowLayoutRoute[router.pathname] || isChatPage);

  return (
    <>
      <Box h={'100%'} bg={'myGray.100'}>
        <Auth>
          <Box
            height={'100%'}
            {...(showPhoneNavbar
              ? {
                  display: 'flex',
                  flexDirection: 'column'
                }
              : {
                  display: 'block',
                  overflowY: 'auto'
                })}
          >
            {showPcNavbar && (
              <Box position="fixed" left={0} top={0} w={navbarWidth} h="100%">
                <Navbar unread={unread} />
              </Box>
            )}

            <Box
              {...(showPhoneNavbar ? { h: 0, flex: '1 0 0' } : { h: '100%' })}
              {...(showPcNavbar ? { ml: navbarWidth, overflow: 'overlay' } : {})}
            >
              {children}
            </Box>

            {showPhoneNavbar && (
              <Box h="50px" borderTop="1px solid rgba(0,0,0,0.1)">
                <NavbarPhone unread={unread} />
              </Box>
            )}
          </Box>
        </Auth>
      </Box>

      {/* 各种 Modal */}
      {feConfigs?.isPlus && (
        <>
          <NotSufficientModal />
          <SupportBot />
        </>
      )}
      <ManualCopyModal />
      <PostLoginActionOrchestrator
        importantInforms={importantInforms}
        importantInformQueryError={isUnreadDataError}
        refetchImportantInforms={refetchUnRead}
        unreadQueryFetched={unreadQueryFetched}
      />
      {showProModal && <ProModal isOpen onClose={() => setShowProModal(false)} />}
      {/* 全局 Loading */}
      <Loading loading={loading} zIndex={999999} />
    </>
  );
};

export default Layout;
