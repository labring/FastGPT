import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AbsoluteCenter, Box, Button, Flex } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useRouter } from 'next/router';
import { type Dispatch, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import Avatar from '@fastgpt/web/components/common/Avatar';
import dynamic from 'next/dynamic';
import { POST } from '@/web/common/api/request';
import { getBdVId } from '@/web/support/marketing/utils';

type Props = {
  children: React.ReactNode;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  pageType: `${LoginPageTypeEnum}`;
};

type OAuthItem = {
  label: string;
  provider: OAuthEnum | LoginPageTypeEnum;
  icon: any;
  pageType?: LoginPageTypeEnum;
  redirectUrl?: string;
};

const FormLayout = ({ children, setPageType, pageType }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const rootLogin = router.query.rootLogin === '1';

  const { setLoginStore, feConfigs } = useSystemStore();
  const logoSrc = getWebReqUrl(feConfigs?.systemLogo || LOGO_ICON);

  const { lastRoute = '/dashboard/agent' } = router.query as { lastRoute: string };
  const computedLastRoute = useMemo(() => {
    return router.pathname === '/chat' || router.pathname === '/chat/share'
      ? router.asPath
      : lastRoute;
  }, [lastRoute, router.pathname, router.asPath]);

  const state = useRef(getNanoid(8));
  const redirectUri = `${location.origin}/login/provider`;

  const isWecomWorkTerminal = checkIsWecomTerminal();

  const oAuthList: OAuthItem[] = useMemo(
    () => [
      ...(feConfigs?.sso?.url
        ? [
            {
              label: feConfigs.sso.title || 'Unknown',
              provider: OAuthEnum.sso,
              icon: feConfigs.sso.icon
            }
          ]
        : []),
      ...(feConfigs?.oauth?.wechat && pageType !== LoginPageTypeEnum.wechat
        ? [
            {
              label: t('common:support.user.login.Wechat'),
              provider: OAuthEnum.wechat,
              icon: 'common/wechatFill',
              pageType: LoginPageTypeEnum.wechat
            }
          ]
        : []),
      ...(feConfigs?.oauth?.google
        ? [
            {
              label: t('common:support.user.login.Google'),
              provider: OAuthEnum.google,
              icon: 'common/googleFill',
              redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${feConfigs?.oauth?.google}&redirect_uri=${redirectUri}&state=${state.current}&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email%20openid&include_granted_scopes=true`
            }
          ]
        : []),
      ...(feConfigs?.oauth?.github
        ? [
            {
              label: t('common:support.user.login.Github'),
              provider: OAuthEnum.github,
              icon: 'common/gitFill',
              redirectUrl: `https://github.com/login/oauth/authorize?client_id=${feConfigs?.oauth?.github}&redirect_uri=${redirectUri}&state=${state.current}&scope=user:email%20read:user`
            }
          ]
        : []),
      ...(feConfigs?.oauth?.microsoft
        ? [
            {
              label:
                feConfigs?.oauth?.microsoft?.customButton ||
                t('common:support.user.login.Microsoft'),
              provider: OAuthEnum.microsoft,
              icon: 'common/microsoft',
              redirectUrl: `https://login.microsoftonline.com/${feConfigs?.oauth?.microsoft?.tenantId || 'common'}/oauth2/v2.0/authorize?client_id=${feConfigs?.oauth?.microsoft?.clientId}&response_type=code&redirect_uri=${redirectUri}&response_mode=query&scope=https%3A%2F%2Fgraph.microsoft.com%2Fuser.read&state=${state.current}`
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
        : [])
    ],
    [feConfigs, pageType, redirectUri, t]
  );

  const show_oauth = useMemo(
    () => !!(feConfigs?.sso?.url || oAuthList.length > 0),
    [feConfigs?.sso?.url, oAuthList.length]
  );

  const onClickOauth = useCallback(
    async (item: OAuthItem) => {
      if (item.provider === OAuthEnum.sso) {
        const redirectUrl = await POST<string>('/proApi/support/user/account/login/getAuthURL', {
          redirectUri,
          isWecomWorkTerminal
        });
        setLoginStore({
          provider: item.provider as OAuthEnum,
          lastRoute: computedLastRoute,
          state: state.current
        });
        router.replace(redirectUrl, '_self');
        return;
      }

      if (item.provider === OAuthEnum.wecom) {
        const redirectUrl = await POST<string>(
          '/proApi/support/user/account/login/wecom/getRedirectUrl',
          {
            redirectUri,
            isWecomWorkTerminal,
            state: state.current
          }
        );
        setLoginStore({
          provider: item.provider as OAuthEnum,
          lastRoute: computedLastRoute,
          state: state.current
        });
        router.replace(redirectUrl, '_self');
        return;
      }

      if (item.redirectUrl) {
        setLoginStore({
          provider: item.provider as OAuthEnum,
          lastRoute: computedLastRoute,
          state: state.current
        });
        router.replace(item.redirectUrl, '_self');
      }
      item.pageType && setPageType(item.pageType);
    },
    [computedLastRoute, isWecomWorkTerminal, redirectUri, router, setLoginStore, setPageType]
  );

  // Auto login
  useEffect(() => {
    if (rootLogin) return;
    const sso = oAuthList.find((item) => item.provider === OAuthEnum.sso);
    // sso auto login
    if (sso && (feConfigs?.sso?.autoLogin || isWecomWorkTerminal)) onClickOauth(sso);
    if (feConfigs.oauth?.wecom && isWecomWorkTerminal) {
      onClickOauth({
        provider: OAuthEnum.wecom
      } as any);
    }
  }, [
    rootLogin,
    feConfigs?.sso?.autoLogin,
    isWecomWorkTerminal,
    onClickOauth,
    oAuthList,
    feConfigs.oauth?.wecom
  ]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex alignItems={'center'} justifyContent={'center'}>
        <Flex flexDirection={'column'} alignItems={'center'} gap={8}>
          <MyImage src={logoSrc} w={['36px', '48px']} alt={'icon'} />
          <Box ml={[3, 5]} fontSize={['lg', 'xl']} fontWeight={'bold'} color={'myGray.900'}>
            {feConfigs?.systemTitle || t('sangfor:support.user.login.fastgpt_sxf_com')}
          </Box>
        </Flex>
        {/* {!isPc && <I18nLngSelector />} */}
      </Flex>
      {children}
      {show_oauth && (
        <Box mt={8}>
          <Box flex={1} />
          <Box position={'relative'}>
            <Box h={'1px'} bg={'myGray.250'} />
            <AbsoluteCenter bg={'white'} px={3} color={'myGray.500'} fontSize={'mini'}>
              or
            </AbsoluteCenter>
          </Box>
          <Box mt={4}>
            {oAuthList.map((item) => (
              <Box key={item.provider} _notFirst={{ mt: 4 }}>
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
          </Box>
        </Box>
      )}
    </Flex>
  );
};

export default dynamic(() => Promise.resolve(FormLayout), {
  ssr: false
});
