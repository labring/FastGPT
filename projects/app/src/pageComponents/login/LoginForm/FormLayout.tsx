import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AbsoluteCenter, Box, Button, Flex } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { useRouter } from 'next/router';
import { type Dispatch, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import Avatar from '@fastgpt/web/components/common/Avatar';
import dynamic from 'next/dynamic';
import { POST } from '@/web/common/api/request';
import { getBdVId } from '@/web/support/marketing/utils';

interface Props {
  children: React.ReactNode;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  pageType: `${LoginPageTypeEnum}`;
}

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
  const { isPc } = useSystem();

  const { lastRoute = '/dashboard/apps' } = router.query as { lastRoute: string };
  const state = useRef(getNanoid(8));
  const redirectUri = `${location.origin}/login/provider`;

  const isWecomWorkTerminal = checkIsWecomTerminal();

  const oAuthList: OAuthItem[] = [
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
              feConfigs?.oauth?.microsoft?.customButton || t('common:support.user.login.Microsoft'),
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
  ];

  const show_oauth = useMemo(
    () => !getBdVId() && !!(feConfigs?.sso?.url || oAuthList.length > 0),
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
          lastRoute,
          state: state.current
        });
        router.replace(redirectUrl, '_self');
        return;
      }

      if (item.redirectUrl) {
        setLoginStore({
          provider: item.provider as OAuthEnum,
          lastRoute,
          state: state.current
        });
        router.replace(item.redirectUrl, '_self');
      }
      item.pageType && setPageType(item.pageType);
    },
    [lastRoute, router, setLoginStore, setPageType]
  );

  // Auto login
  useEffect(() => {
    if (rootLogin) return;
    const sso = oAuthList.find((item) => item.provider === OAuthEnum.sso);
    // sso auto login
    if (sso && (feConfigs?.sso?.autoLogin || isWecomWorkTerminal)) onClickOauth(sso);
  }, [rootLogin, feConfigs?.sso?.autoLogin, isWecomWorkTerminal, onClickOauth]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex alignItems={'center'} justify={'space-between'} mb={8}>
        <Flex alignItems={'center'} flex={1} justify={'center'}>
          <Flex
            w={['48px', '64px']}
            h={['48px', '64px']}
            bg={'linear-gradient(135deg, #4a90e2 0%, #2c5aa0 50%, #1a4480 100%)'}
            borderRadius={['12px', '16px']}
            borderWidth={['2px', '2px']}
            borderColor={'rgba(74, 144, 226, 0.3)'}
            alignItems={'center'}
            justifyContent={'center'}
            boxShadow={
              '0px 8px 24px rgba(26, 68, 128, 0.25), inset 0px 2px 0px rgba(255, 255, 255, 0.3)'
            }
            position={'relative'}
            _before={{
              content: '""',
              position: 'absolute',
              top: '-2px',
              left: '-2px',
              right: '-2px',
              bottom: '-2px',
              background: 'linear-gradient(135deg, #4a90e2, #2c5aa0, #1a4480)',
              borderRadius: ['14px', '18px'],
              zIndex: -1,
              opacity: 0.3
            }}
          >
            <MyImage src={LOGO_ICON} w={['28px', '40px']} alt={'icon'} />
          </Flex>
          <Box ml={[4, 6]}>
            <Box
              fontSize={['xl', '2xl']}
              fontWeight={'800'}
              color={'#1a4480'}
              letterSpacing={'-0.5px'}
              lineHeight={'1.2'}
            >
              {feConfigs?.systemTitle}
            </Box>
            <Box fontSize={['xs', 'sm']} color={'rgba(26, 68, 128, 0.7)'} fontWeight={'500'} mt={1}>
              智能AI应用平台
            </Box>
          </Box>
        </Flex>
        {!isPc && <I18nLngSelector />}
      </Flex>
      {children}
      {show_oauth && (
        <>
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
        </>
      )}
    </Flex>
  );
};

export default dynamic(() => Promise.resolve(FormLayout), {
  ssr: false
});
