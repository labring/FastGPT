import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useQuery } from '@tanstack/react-query';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useInvitationResultToast } from '@/web/support/user/team/useInvitationResultToast';
import { getUnreadCount } from '@/web/support/user/inform/api';
import dynamic from 'next/dynamic';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';

import Auth from './auth';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useCheckCoupon } from './hooks/checkCoupon';
import SupportBot from './SupportBot';
import { getAdminModelConfig } from '@/web/core/ai/model/api';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { isRouteVisible } from '@/pageComponents/admin/utils';
import { isLicenseActive } from '@fastgpt/global/common/system/license/utils';
import { clientInitData } from '@/web/common/system/staticData';

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
  '/config/tool/marketplace': true,
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
  '/config/tool/marketplace': true,
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
    initd,
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

  useInvitationResultToast();

  const isRoot = userInfo?.username === 'root';
  // /admin 区域外的路由（工作台、知识库、对话等）属于开源版本体，不受 License 状态影响
  const isAdminRoute = router.pathname.startsWith('/admin/');

  useEffect(() => {
    if (!initd || !isRoot || typeof feConfigs.isProService === 'boolean') return;
    // 较早的匿名初始化可能晚于登录态响应返回；缺少版本投影时补取当前登录态。
    void clientInitData().catch(() => {});
  }, [feConfigs.isProService, initd, isRoot]);

  useEffect(() => {
    if (!initd || !isRoot || feConfigs.isProService !== true) return;
    void initLicenseData();
  }, [feConfigs.isProService, initLicenseData, initd, isRoot]);

  // 路由和菜单共用字段可见性规则；配置页不受商业业务 License 门禁的固定白名单限制。
  const isLicenseValid = useMemo(() => isLicenseActive(licenseData), [licenseData]);
  // 匿名初始化响应没有版本信息，要等登录态配置和 License 决议完成再挂载后台页面。
  const isAdminAccessReady =
    initd && typeof feConfigs.isProService === 'boolean' && !licenseLoading;
  const isAdminRouteVisible = isRouteVisible(router.pathname, {
    isProService: !!feConfigs.isProService,
    licenseActive: isLicenseValid,
    hasPayCapability: licenseData?.functions?.pay ?? true,
    enableSaasAdminConfig: feConfigs.enableSaasAdminConfig
  });
  useEffect(() => {
    if (!isAdminRoute || !initd || !userInfo) return;
    if (!isRoot) {
      void router.replace('/account/info');
      return;
    }
    if (loading || !isAdminAccessReady || isAdminRouteVisible) return;
    void router.replace('/admin/license');
  }, [
    initd,
    isAdminAccessReady,
    isAdminRoute,
    isAdminRouteVisible,
    isRoot,
    loading,
    router,
    userInfo
  ]);

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
              {(!isAdminRoute || (isRoot && isAdminAccessReady && isAdminRouteVisible)) && children}
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
      <Loading
        loading={loading || (isAdminRoute && isRoot && !isAdminAccessReady)}
        zIndex={999999}
      />
    </>
  );
};

export default Layout;
