import React, { useState, Dispatch, useCallback, useRef } from 'react';
import {
  FormControl,
  Flex,
  Input,
  Button,
  Divider,
  AbsoluteCenter,
  Box,
  Link,
  useTheme
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { PageTypeEnum } from '@/constants/user';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { postLogin } from '@/web/support/user/api';
import type { ResLogin } from '@/global/support/api/userRes';
import { useToast } from '@/web/common/hooks/useToast';
import { feConfigs } from '@/web/common/system/staticData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { customAlphabet } from 'nanoid';
import { getDocPath } from '@/web/common/system/doc';
import Avatar from '@/components/Avatar';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { useTranslation } from 'next-i18next';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 8);

interface Props {
  setPageType: Dispatch<`${PageTypeEnum}`>;
  loginSuccess: (e: ResLogin) => void;
}

interface LoginFormType {
  username: string;
  password: string;
}

const LoginForm = ({ setPageType, loginSuccess }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { lastRoute = '/app/list' } = router.query as { lastRoute: string };
  const { toast } = useToast();
  const { setLoginStore } = useSystemStore();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormType>();

  const [requesting, setRequesting] = useState(false);

  const onclickLogin = useCallback(
    async ({ username, password }: LoginFormType) => {
      setRequesting(true);
      try {
        loginSuccess(
          await postLogin({
            username,
            password
          })
        );
        toast({
          title: '登录成功',
          status: 'success'
        });
      } catch (error: any) {
        toast({
          title: error.message || '登录异常',
          status: 'error'
        });
      }
      setRequesting(false);
    },
    [loginSuccess, toast]
  );

  const redirectUri = `${location.origin}/login/provider`;
  const state = useRef(nanoid());

  const oAuthList = [
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
    ...(feConfigs?.oauth?.google
      ? [
          {
            label: t('support.user.login.Google'),
            provider: OAuthEnum.google,
            icon: 'common/googleFill',
            redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${feConfigs?.oauth?.google}&redirect_uri=${redirectUri}&state=${state.current}&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email%20openid&include_granted_scopes=true`
          }
        ]
      : [])
  ];

  const isCommunityVersion = feConfigs?.show_register === false && feConfigs?.show_git;

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex alignItems={'center'}>
        <Flex
          w={['48px', '56px']}
          h={['48px', '56px']}
          bg={'myGray.25'}
          borderRadius={'xl'}
          borderWidth={'1.5px'}
          borderColor={theme.borderColor.borderColor}
          alignItems={'center'}
          justifyContent={'center'}
        >
          <Avatar src={LOGO_ICON} w={'30px'} />
        </Flex>
        <Box ml={3} fontSize={['2xl', '3xl']} fontWeight={'bold'}>
          {feConfigs?.systemTitle}
        </Box>
      </Flex>
      <Box
        mt={'42px'}
        onKeyDown={(e) => {
          if (e.keyCode === 13 && !e.shiftKey && !requesting) {
            handleSubmit(onclickLogin)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'myGray.50'}
            placeholder={isCommunityVersion ? '使用root用户登录' : '邮箱/手机号/用户名'}
            {...register('username', {
              required: '邮箱/手机号/用户名不能为空'
            })}
          ></Input>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password}>
          <Input
            bg={'myGray.50'}
            type={'password'}
            placeholder={isCommunityVersion ? 'root密码为你设置的环境变量' : '密码'}
            {...register('password', {
              required: '密码不能为空',
              maxLength: {
                value: 20,
                message: '密码最多 20 位'
              }
            })}
          ></Input>
        </FormControl>
        {feConfigs?.docUrl && (
          <Box mt={7} fontSize={'sm'}>
            使用即代表你同意我们的{' '}
            <Link
              href={getDocPath('/docs/agreement/disclaimer/')}
              target={'_blank'}
              color={'primary.500'}
            >
              免责声明
            </Link>
          </Box>
        )}

        <Button
          type="submit"
          my={6}
          w={'100%'}
          size={['md', 'lg']}
          colorScheme="blue"
          isLoading={requesting}
          onClick={handleSubmit(onclickLogin)}
        >
          {t('home.Login')}
        </Button>

        {feConfigs?.show_register && (
          <>
            <Flex align={'center'} justifyContent={'flex-end'} color={'primary.700'}>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('forgetPassword')}
                fontSize="sm"
              >
                忘记密码?
              </Box>
              <Box mx={3} h={'16px'} w={'1.5px'} bg={'myGray.250'}></Box>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('register')}
                fontSize="sm"
              >
                注册账号
              </Box>
            </Flex>
          </>
        )}
      </Box>
      <Box flex={1} />
      {/* oauth */}
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
                    setLoginStore({
                      provider: item.provider,
                      lastRoute,
                      state: state.current
                    });
                    router.replace(item.redirectUrl, '_self');
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

export default LoginForm;
