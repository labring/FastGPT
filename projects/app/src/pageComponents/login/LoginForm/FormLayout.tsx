import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, IconButton, Button } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { useRouter } from 'next/router';
import { type Dispatch, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import dynamic from 'next/dynamic';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { OAuthAccountVerificationProvider } from '@fastgpt/global/support/user/account/verification/type';
import { createOauthLogin } from '@/web/support/user/api';

type Props = {
  children: React.ReactNode;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  pageType: `${LoginPageTypeEnum}`;
};

type OAuthItem = {
  label: string;
  provider: OAuthAccountVerificationProvider | LoginPageTypeEnum;
  icon: any;
  pageType?: LoginPageTypeEnum;
};

const FormLayout = ({ children, setPageType, pageType }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const rootLogin = router.query.rootLogin === '1';

  const { setLoginStore, feConfigs } = useSystemStore();

  const { lastRoute = '/dashboard/agent', lastTmbId = '' } = router.query as {
    lastRoute: string;
    lastTmbId?: string;
  };
  const computedLastRoute = useMemo(() => {
    return router.pathname === '/chat' ? router.asPath : lastRoute;
  }, [lastRoute, router.pathname, router.asPath]);

  const redirectUri = `${location.origin}/login/provider`;

  const isWecomWorkTerminal = checkIsWecomTerminal();
  const canWecomTerminalAutoRedirect =
    !isWecomWorkTerminal || feConfigs?.wecomLoginAutoRedirect === true;
  const oauthVerificationV2 = feConfigs?.oauthVerificationV2 === true;

  const oAuthList = useMemo<OAuthItem[]>(
    () => [
      ...(oauthVerificationV2 && feConfigs?.sso?.url
        ? [
            {
              label: feConfigs.sso.title || 'Unknown',
              provider: 'sso' as const,
              icon: feConfigs.sso.icon
            }
          ]
        : []),
      ...(feConfigs?.oauth?.wechat && pageType !== LoginPageTypeEnum.wechat
        ? [
            {
              label: t('common:support.user.login.Wechat'),
              provider: LoginPageTypeEnum.wechat,
              icon: 'common/wechatFill',
              pageType: LoginPageTypeEnum.wechat
            }
          ]
        : []),
      ...(pageType !== LoginPageTypeEnum.passwordLogin
        ? [
            {
              label: t('common:support.user.login.Password login'),
              provider: LoginPageTypeEnum.passwordLogin,
              icon: 'support/permission/privateLight',
              pageType: LoginPageTypeEnum.passwordLogin
            }
          ]
        : []),
      ...(oauthVerificationV2 && feConfigs?.oauth?.google
        ? [
            {
              label: t('common:support.user.login.Google'),
              provider: 'google' as const,
              icon: 'common/googleFill'
            }
          ]
        : []),
      ...(oauthVerificationV2 && feConfigs?.oauth?.github
        ? [
            {
              label: t('common:support.user.login.Github'),
              provider: 'github' as const,
              icon: 'common/gitFill'
            }
          ]
        : []),
      ...(oauthVerificationV2 && feConfigs?.oauth?.microsoft
        ? [
            {
              label:
                feConfigs?.oauth?.microsoft?.customButton ||
                t('common:support.user.login.Microsoft'),
              provider: 'microsoft' as const,
              icon: 'common/microsoft'
            }
          ]
        : [])
    ],
    [feConfigs, oauthVerificationV2, pageType, t]
  );

  const show_oauth = oAuthList.length > 0;

  const onClickOauth = useCallback(
    async (item: OAuthItem) => {
      if (item.pageType) {
        setPageType(item.pageType);
        return;
      }

      const provider = item.provider as OAuthAccountVerificationProvider;
      const { state, url } = await createOauthLogin({
        provider,
        callbackUrl: redirectUri,
        isWecomWorkTerminal
      });
      setLoginStore({
        provider,
        lastRoute: computedLastRoute,
        lastTmbId,
        state,
        callbackUrl: redirectUri
      });
      router.replace(url, '_self');
    },
    [
      computedLastRoute,
      isWecomWorkTerminal,
      lastTmbId,
      redirectUri,
      router,
      setLoginStore,
      setPageType
    ]
  );

  // Auto login
  useEffect(() => {
    if (rootLogin) return;
    const sso = oAuthList.find((item) => item.provider === 'sso');
    // sso auto login
    if (sso && canWecomTerminalAutoRedirect && (feConfigs?.sso?.autoLogin || isWecomWorkTerminal)) {
      void onClickOauth(sso);
      return;
    }
    if (
      oauthVerificationV2 &&
      feConfigs.oauth?.wecom &&
      isWecomWorkTerminal &&
      canWecomTerminalAutoRedirect
    ) {
      void onClickOauth({
        label: 'Wecom',
        provider: 'wecom',
        icon: 'common/wecom'
      });
    }
  }, [
    rootLogin,
    canWecomTerminalAutoRedirect,
    feConfigs?.sso?.autoLogin,
    oauthVerificationV2,
    isWecomWorkTerminal,
    onClickOauth,
    oAuthList,
    feConfigs.oauth?.wecom
  ]);

  return (
    <Flex
      flexDirection={'column'}
      h={'100%'}
      alignItems={['center', 'stretch']}
      justifyContent={['center', 'flex-start']}
    >
      <Flex
        alignItems={'center'}
        justifyContent={['flex-start', 'center']}
        w={['fit-content', '100%']}
        alignSelf={['flex-start', 'auto']}
      >
        <Flex alignItems={'center'} pr={['0', '4']} w={'fit-content'} justifyContent={'flex-start'}>
          <Flex
            w={['42px', '56px']}
            h={['42px', '56px']}
            bg={'white'}
            borderRadius={['semilg', 'lg']}
            borderWidth={['1px', '1.5px']}
            borderColor={'myGray.200'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyImage src={LOGO_ICON} w={['22.5px', '36px']} alt={'icon'} />
          </Flex>
          <Box ml={[3, 5]} fontSize={['lg', 'xl']} fontWeight={'bold'} color={'myGray.900'}>
            {feConfigs?.systemTitle}
          </Box>
        </Flex>
      </Flex>
      <Box w={'100%'} mt={[8, 0]}>
        {children}
      </Box>
      {show_oauth && (
        <Box mt={8} w={'100%'}>
          <Box flex={1} />

          <Flex position={'relative'} mb={4} alignItems={'center'}>
            <Box h={'1px'} flex={'1'} bg={'myGray.250'} />
            <Box px={3} color={'myGray.500'} fontSize={'mini'}>
              or
            </Box>
            <Box h={'1px'} flex={'1'} bg={'myGray.250'} />
          </Flex>

          {oAuthList.length > 2 ? (
            <Flex gap={4} alignItems={'center'} justifyContent={'center'}>
              {oAuthList.map((item) => (
                <MyTooltip key={item.provider}>
                  <IconButton
                    size={'lgSquare'}
                    borderRadius={'50%'}
                    aria-label={item.label}
                    variant={'whitePrimary'}
                    icon={<Avatar src={item.icon as any} w={'20px'} />}
                    onClick={() => onClickOauth(item)}
                  />
                </MyTooltip>
              ))}
            </Flex>
          ) : (
            <Flex gap={4} alignItems={'center'} justifyContent={'center'}>
              {oAuthList.map((item) => (
                <Box key={item.provider} flex={1}>
                  <Button
                    variant={'whitePrimary'}
                    w={'100%'}
                    h={'40px'}
                    borderRadius={'sm'}
                    fontWeight={'medium'}
                    leftIcon={<Avatar src={item.icon as any} w={'20px'} />}
                    onClick={() => onClickOauth(item)}
                  >
                    {item.label}
                  </Button>
                </Box>
              ))}
            </Flex>
          )}
        </Box>
      )}
    </Flex>
  );
};

export default dynamic(() => Promise.resolve(FormLayout), {
  ssr: false
});
