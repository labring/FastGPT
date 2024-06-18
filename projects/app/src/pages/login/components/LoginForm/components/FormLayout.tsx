import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AbsoluteCenter, Box, Button, Flex, Image } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { customAlphabet } from 'nanoid';
import { useRouter } from 'next/router';
import { Dispatch, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import Divider from '@/pages/app/detail/components/WorkflowComponents/Flow/components/Divider';
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

  const oAuthList = [
    ...(feConfigs?.oauth?.wechat && pageType !== LoginPageTypeEnum.wechat
      ? [
          {
            label: t('support.user.login.Wechat'),
            provider: OAuthEnum.wechat,
            icon: 'common/wechatFill',
            pageType: LoginPageTypeEnum.wechat
          }
        ]
      : []),
    ...(feConfigs?.oauth?.google
      ? [
          {
            label: t('support.user.login.Google'),
            provider: OAuthEnum.google,
            icon: 'common/googleFill',
            redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${feConfigs?.oauth?.google}&redirect_uri=${redirectUri}&state=${state.current}&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email%20openid&include_granted_scopes=true`
          }
        ]
      : []),
    ...(feConfigs?.oauth?.github
      ? [
          {
            label: t('support.user.login.Github'),
            provider: OAuthEnum.github,
            icon: 'common/gitFill',
            redirectUrl: `https://github.com/login/oauth/authorize?client_id=${feConfigs?.oauth?.github}&redirect_uri=${redirectUri}&state=${state.current}&scope=user:email%20read:user`
          }
        ]
      : []),
    ...(pageType !== LoginPageTypeEnum.passwordLogin
      ? [
          {
            label: t('support.user.login.Password login'),
            provider: LoginPageTypeEnum.passwordLogin,
            icon: 'support/account/passwordLogin',
            pageType: LoginPageTypeEnum.passwordLogin
          }
        ]
      : [])
  ];
  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex alignItems={'center'}>
        <Flex
          w={['48px', '56px']}
          h={['48px', '56px']}
          bg={'myGray.25'}
          borderRadius={'xl'}
          borderWidth={'1.5px'}
          borderColor={'borderColor.base'}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <Image src={LOGO_ICON} w={['24px', '28px']} alt={'icon'} />
        </Flex>
        <Box ml={3} fontSize={['2xl', '3xl']} fontWeight={'bold'}>
          {feConfigs?.systemTitle}
        </Box>
      </Flex>
      {children}
      <Box flex={1} />
      {feConfigs?.show_register && oAuthList.length > 0 && (
        <>
          <Box position={'relative'}>
            <Divider />
            <AbsoluteCenter bg="white" px="4" color={'myGray.500'}>
              or
            </AbsoluteCenter>
          </Box>
          <Box mt={8}>
            {oAuthList.map((item) => (
              <Box key={item.provider} _notFirst={{ mt: 4 }}>
                <Button
                  variant={'whitePrimary'}
                  w={'100%'}
                  h={'42px'}
                  leftIcon={
                    <MyIcon
                      name={item.icon as any}
                      w={'20px'}
                      cursor={'pointer'}
                      color={'myGray.800'}
                    />
                  }
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
          </Box>
        </>
      )}
    </Flex>
  );
};

export default FormLayout;
