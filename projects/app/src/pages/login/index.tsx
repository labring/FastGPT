import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Center,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex,
  useDisclosure
} from '@chakra-ui/react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import dynamic from 'next/dynamic';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { clearToken } from '@/web/support/user/auth';
import type { LoginSuccessResponse } from '@/global/support/api/userRes';
import Script from 'next/script';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useLocalStorageState, useMount } from 'ahooks';
import { useTranslation } from 'next-i18next';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { GET } from '@/web/common/api/request';
import { getDocPath } from '@/web/common/system/doc';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import LoginForm from '@/pageComponents/login/LoginForm/LoginForm';
import { getBdVId } from '@/web/support/marketing/utils';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';

const RegisterForm = dynamic(() => import('@/pageComponents/login/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('@/pageComponents/login/ForgetPasswordForm'));
const WechatForm = dynamic(() => import('@/pageComponents/login/LoginForm/WechatForm'));
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

const ipDetectURL = 'https://qifu-api.baidubce.com/ip/local/geo/v1/district';

const Login = ({ ChineseRedirectUrl }: { ChineseRedirectUrl: string }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { lastRoute = '' } = router.query as { lastRoute: string };
  const { feConfigs } = useSystemStore();
  const [pageType, setPageType] = useState<`${LoginPageTypeEnum}`>(LoginPageTypeEnum.passwordLogin);
  const { setUserInfo } = useUserStore();
  const { setLastChatAppId } = useChatStore();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isPc } = useSystem();

  const {
    isOpen: isOpenCookiesDrawer,
    onOpen: onOpenCookiesDrawer,
    onClose: onCloseCookiesDrawer
  } = useDisclosure();
  const cookieVersion = '1';
  const [localCookieVersion, setLocalCookieVersion] =
    useLocalStorageState<string>('localCookieVersion');

  const loginSuccess = useCallback(
    (res: LoginSuccessResponse) => {
      setUserInfo(res.user);

      const decodeLastRoute = decodeURIComponent(lastRoute);

      const navigateTo =
        decodeLastRoute && !decodeLastRoute.includes('/login') && decodeLastRoute.startsWith('/')
          ? lastRoute
          : '/dashboard/agent';

      router.push(navigateTo);
    },
    [setUserInfo, lastRoute, router]
  );

  const DynamicComponent = useMemo(() => {
    const TypeMap = {
      [LoginPageTypeEnum.passwordLogin]: LoginForm,
      [LoginPageTypeEnum.register]: RegisterForm,
      [LoginPageTypeEnum.forgetPassword]: ForgetPasswordForm,
      [LoginPageTypeEnum.wechat]: WechatForm
    };

    // @ts-ignore
    const Component = TypeMap[pageType];

    return <Component setPageType={setPageType} loginSuccess={loginSuccess} />;
  }, [pageType, loginSuccess]);

  /* default login type */
  useEffect(() => {
    const bd_vid = getBdVId();
    if (bd_vid) {
      setPageType(LoginPageTypeEnum.passwordLogin);
      return;
    }
    setPageType(
      feConfigs?.oauth?.wechat ? LoginPageTypeEnum.wechat : LoginPageTypeEnum.passwordLogin
    );

    // init store
    setLastChatAppId('');
  }, [feConfigs?.oauth, setLastChatAppId]);

  const {
    isOpen: isOpenRedirect,
    onOpen: onOpenRedirect,
    onClose: onCloseRedirect
  } = useDisclosure();
  const [showRedirect, setShowRedirect] = useLocalStorageState<boolean>('showRedirect', {
    defaultValue: true
  });
  const checkIpInChina = useCallback(async () => {
    try {
      const res = await GET<any>(ipDetectURL);
      const country = res?.country;
      if (
        country &&
        country === '中国' &&
        res.prov !== '中国香港' &&
        res.prov !== '中国澳门' &&
        res.prov !== '中国台湾'
      ) {
        onOpenRedirect();
      }
    } catch (error) {
      console.log(error);
    }
  }, [onOpenRedirect]);

  useMount(() => {
    clearToken();
    router.prefetch('/dashboard/agent');

    ChineseRedirectUrl && showRedirect && checkIpInChina();
    localCookieVersion !== cookieVersion && onOpenCookiesDrawer();
  });

  return (
    <>
      {feConfigs.googleClientVerKey && (
        <Script
          src={`https://www.recaptcha.net/recaptcha/api.js?render=${feConfigs.googleClientVerKey}`}
        ></Script>
      )}

      <Flex h={'100%'} userSelect={'none'}>
        <Flex
          position={'absolute'}
          top={'24px'}
          right={'44px'}
          width={isPc ? 'calc(40% - 88px)' : 'calc(100% - 88px)'}
          zIndex={10}
          alignItems={'center'}
          justifyContent={'right'}
        >
          {/* <Flex alignItems={'center'}>
            <Flex w={'40px'} h={'40px'} alignItems={'center'} justifyContent={'center'}>
              <MyImage src={LOGO_ICON} w={'24px'} alt={'icon'} />
            </Flex>
            <Box ml={2} fontSize={'lg'} fontWeight={'bold'} color={'myGray.900'}>
              {feConfigs?.systemTitle}
            </Box>
          </Flex> */}
          <I18nLngSelector />
        </Flex>

        {/* 左侧内容区域 - 仅在PC端显示 */}
        {isPc && (
          <Flex
            w={'60%'}
            flexDirection={'column'}
            alignItems={'flex-start'}
            bg={`url(${feConfigs?.systemBackground ? feConfigs.systemBackground : getWebReqUrl('/icon/sangfor-login-bg2.svg')}) center / cover no-repeat`}
            position={'relative'}
            padding={'6% 5% 0'}
          >
            {/* 左侧文案内容 */}
            {/* <Box maxW={'680px'}>
              <Box
                fontSize={'40px'}
                fontWeight={'bold'}
                color={'#666'}
                mb={'20px'}
                lineHeight={'48px'}
              >
                {t('sangfor:support.user.login.fastgpt_sxf_com')}
              </Box>
              <Box fontSize={'14px'} color={'#666'} lineHeight={'28px'} letterSpacing={'normal'}>
                {t('sangfor:support.user.login.sxf_com_platform_desc')}
              </Box>
            </Box> */}
          </Flex>
        )}

        {/* 右侧登录表单区域 */}
        <Flex
          w={isPc ? '40%' : '100%'}
          flexDirection={'column'}
          alignItems={'center'}
          justifyContent={'center'}
          bg={'white'}
          minH={'100vh'}
        >
          <Flex flexDirection={'column'} w={'60%'} minWidth={'320px'} bg={'white'}>
            <Box w={'100%'}>
              {pageType ? (
                DynamicComponent
              ) : (
                <Center w={'full'} h={'full'} position={'relative'}>
                  <Loading fixed={false} />
                </Center>
              )}
            </Box>
            {feConfigs?.concatMd && (
              <Box
                mt={8}
                color={'primary.700'}
                fontSize={'mini'}
                fontWeight={'medium'}
                cursor={'pointer'}
                textAlign={'center'}
                onClick={onOpen}
              >
                {t('common:support.user.login.can_not_login')}
              </Box>
            )}
          </Flex>
        </Flex>

        {isOpen && <CommunityModal onClose={onClose} />}
      </Flex>

      {showRedirect && (
        <RedirectDrawer
          isOpen={isOpenRedirect}
          onClose={onCloseRedirect}
          onRedirect={() => router.push(ChineseRedirectUrl)}
          disableDrawer={() => setShowRedirect(false)}
        />
      )}
      {isOpenCookiesDrawer && (
        <CookiesDrawer
          onAgree={() => {
            setLocalCookieVersion(cookieVersion);
            onCloseCookiesDrawer();
          }}
          onClose={onCloseCookiesDrawer}
        />
      )}
    </>
  );
};

function RedirectDrawer({
  isOpen,
  onClose,
  disableDrawer,
  onRedirect
}: {
  isOpen: boolean;
  onClose: () => void;
  disableDrawer: () => void;
  onRedirect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Drawer placement="bottom" size={'xs'} isOpen={isOpen} onClose={onClose}>
      <DrawerOverlay backgroundColor={'rgba(0,0,0,0.2)'} />
      <DrawerContent py={'1.75rem'} px={'3rem'}>
        <DrawerCloseButton size={'sm'} />
        <Flex align={'center'} justify={'space-between'}>
          <Box>
            <Box color={'myGray.900'} fontWeight={'500'} fontSize={'1rem'}>
              {t('login:Chinese_ip_tip')}
            </Box>
            <Box
              color={'primary.700'}
              fontWeight={'500'}
              fontSize={'1rem'}
              textDecorationLine={'underline'}
              cursor={'pointer'}
              onClick={disableDrawer}
            >
              {t('login:no_remind')}
            </Box>
          </Box>
          <Button ml={'0.75rem'} onClick={onRedirect}>
            {t('login:redirect')}
          </Button>
        </Flex>
      </DrawerContent>
    </Drawer>
  );
}

function CookiesDrawer({ onClose, onAgree }: { onClose: () => void; onAgree: () => void }) {
  const { t } = useTranslation();

  return (
    <Drawer placement="bottom" size={'xs'} isOpen={true} onClose={onClose}>
      <DrawerOverlay backgroundColor={'rgba(0,0,0,0.2)'} />
      <DrawerContent py={'1.75rem'} px={'3rem'}>
        <DrawerCloseButton size={'sm'} />
        <Flex align={'center'} justify={'space-between'}>
          <Box>
            <Box color={'myGray.900'} fontWeight={'500'} fontSize={'1rem'}>
              {t('login:cookies_tip')}
            </Box>
            <Box
              color={'primary.700'}
              fontWeight={'500'}
              fontSize={'1rem'}
              textDecorationLine={'underline'}
              cursor={'pointer'}
              w={'fit-content'}
              onClick={() => window.open(getDocPath('/docs/agreement/privacy/'), '_blank')}
            >
              {t('login:privacy_policy')}
            </Box>
          </Box>
          <Button ml={'0.75rem'} onClick={onAgree}>
            {t('login:agree')}
          </Button>
        </Flex>
      </DrawerContent>
    </Drawer>
  );
}

export async function getServerSideProps(context: any) {
  return {
    props: {
      ChineseRedirectUrl: process.env.CHINESE_IP_REDIRECT_URL ?? '',
      ...(await serviceSideProps(context, ['app', 'user', 'login', 'sangfor']))
    }
  };
}

export default Login;
