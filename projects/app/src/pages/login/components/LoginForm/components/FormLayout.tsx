import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AbsoluteCenter, Box, Button, Flex } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { customAlphabet } from 'nanoid';
import { useRouter } from 'next/router';
import { Dispatch, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 8);

interface Props {
  children: React.ReactNode;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  pageType: `${LoginPageTypeEnum}`;
}

const FormLayout = ({ children, setPageType, pageType }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { setLoginStore, feConfigs } = useSystemStore();
  const { lastRoute = '/app/list' } = router.query as { lastRoute: string };
  const state = useRef(nanoid());
  const redirectUri = `${location.origin}/login/provider`;
  const { isPc } = useSystem();

  const oAuthList = [
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

  const show_oauth =
    !sessionStorage.getItem('bd_vid') && !!(feConfigs?.sso || oAuthList.length > 0);

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
                  leftIcon={<MyIcon name={item.icon as any} w={'20px'} />}
                  onClick={() => {
                    item.redirectUrl &&
                      setLoginStore({
                        provider: item.provider,
                        lastRoute,
                        state: state.current
                      });
                    item.redirectUrl && router.replace(item.redirectUrl, '_self');
                    item.pageType && setPageType(item.pageType);
                  }}
                >
                  {item.label}
                </Button>
              </Box>
            ))}

            {feConfigs?.sso && (
              <Box mt={4} color={'primary.700'} cursor={'pointer'} textAlign={'center'}>
                <Button
                  variant={'whitePrimary'}
                  w={'100%'}
                  h={'40px'}
                  borderRadius={'sm'}
                  leftIcon={<MyImage alt="" src={feConfigs.sso.icon as any} w="20px" />}
                  onClick={() => {
                    feConfigs.sso?.url && router.replace(feConfigs.sso?.url, '_self');
                  }}
                >
                  {feConfigs.sso.title}
                </Button>
              </Box>
            )}
          </Box>
        </>
      )}
    </Flex>
  );
};

export default FormLayout;
