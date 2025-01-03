import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AbsoluteCenter, Box, Button, Flex } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { useRouter } from 'next/router';
import { Dispatch, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import Avatar from '@fastgpt/web/components/common/Avatar';
import dynamic from 'next/dynamic';

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

  const { setLoginStore, feConfigs } = useSystemStore();
  const { isPc } = useSystem();

  const { lastRoute = '/app/list' } = router.query as { lastRoute: string };
  const state = useRef(getNanoid(8));
  const redirectUri = `${location.origin}/login/provider`;

  const isWecomWorkTerminal = checkIsWecomTerminal();

  const oAuthList: OAuthItem[] = [
    ...(feConfigs?.sso?.url
      ? [
          {
            label: feConfigs.sso.title || 'Unknown',
            provider: OAuthEnum.sso,
            icon: feConfigs.sso.icon,
            redirectUrl: `${feConfigs.sso.url}/login/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state.current}`
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
    ...(feConfigs?.oauth?.dingtalk
      ? [
          {
            label: t('user:login.Dingtalk'),
            provider: OAuthEnum.dingtalk,
            icon: 'common/dingtalkFill',
            redirectUrl: `https://login.dingtalk.com/oauth2/auth?client_id=${feConfigs?.oauth?.dingtalk}&redirect_uri=${redirectUri}&state=${state.current}&response_type=code&scope=openid&prompt=consent`
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
    ...(feConfigs?.oauth?.wecom
      ? [
          {
            label: t('login:wecom'),
            provider: OAuthEnum.wecom,
            icon: 'common/wecom',
            redirectUrl: isWecomWorkTerminal
              ? `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${feConfigs?.oauth?.wecom?.corpid}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&agentid=${feConfigs?.oauth?.wecom?.agentid}&state=${state.current}#wechat_redirect`
              : `https://login.work.weixin.qq.com/wwlogin/sso/login?login_type=CorpApp&appid=${feConfigs?.oauth?.wecom?.corpid}&agentid=${feConfigs?.oauth?.wecom?.agentid}&redirect_uri=${redirectUri}&state=${state.current}`
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
    () => !sessionStorage.getItem('bd_vid') && !!(feConfigs?.sso?.url || oAuthList.length > 0),
    [feConfigs?.sso?.url, oAuthList.length]
  );

  const onClickOauth = useCallback(
    async (item: OAuthItem) => {
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

  useEffect(() => {
    const sso = oAuthList.find((item) => item.provider === OAuthEnum.sso);
    const wecom = oAuthList.find((item) => item.provider === OAuthEnum.wecom);
    if (feConfigs?.sso?.autoLogin && sso) {
      // sso auto
      onClickOauth(sso);
    } else if (isWecomWorkTerminal && wecom) {
      // Auto wecom login
      onClickOauth(wecom);
    }
  }, [feConfigs?.sso?.autoLogin, isWecomWorkTerminal, onClickOauth]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex alignItems={'center'} justify={'space-between'}>
        <Flex alignItems={'center'}>
          <Flex
            w={['42px', '56px']}
            h={['42px', '56px']}
            bg={'myGray.25'}
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
