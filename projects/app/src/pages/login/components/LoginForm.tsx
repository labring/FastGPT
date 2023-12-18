import React, { useState, Dispatch, useCallback, useRef } from 'react';
import { FormControl, Flex, Input, Button, FormErrorMessage, Box, Link } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { PageTypeEnum } from '@/constants/user';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { postLogin } from '@/web/support/user/api';
import type { ResLogin } from '@/global/support/api/userRes';
import { useToast } from '@/web/common/hooks/useToast';
import { feConfigs } from '@/web/common/system/staticData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@/components/Icon';
import { customAlphabet } from 'nanoid';
import { getDocPath } from '@/web/common/system/doc';
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
  const router = useRouter();
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
            provider: OAuthEnum.github,
            icon: 'gitFill',
            redirectUrl: `https://github.com/login/oauth/authorize?client_id=${feConfigs?.oauth?.github}&redirect_uri=${redirectUri}&state=${state.current}&scope=user:email%20read:user`
          }
        ]
      : []),
    ...(feConfigs?.oauth?.google
      ? [
          {
            provider: OAuthEnum.google,
            icon: 'googleFill',
            redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${feConfigs?.oauth?.google}&redirect_uri=${redirectUri}&state=${state.current}&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email%20openid&include_granted_scopes=true`
          }
        ]
      : [])
  ];

  const isCommunityVersion = feConfigs?.show_register === false && feConfigs?.show_git;

  return (
    <>
      <Box fontWeight={'bold'} fontSize={'2xl'} textAlign={'center'}>
        登录 {feConfigs?.systemTitle}
      </Box>
      <form onSubmit={handleSubmit(onclickLogin)}>
        <FormControl mt={8} isInvalid={!!errors.username}>
          <Input
            placeholder={isCommunityVersion ? '使用root用户登录' : '邮箱/手机号/用户名'}
            size={['md', 'lg']}
            {...register('username', {
              required: '邮箱/手机号/用户名不能为空'
            })}
          ></Input>
          <FormErrorMessage position={'absolute'} fontSize="xs">
            {!!errors.username && errors.username.message}
          </FormErrorMessage>
        </FormControl>
        <FormControl mt={8} isInvalid={!!errors.password}>
          <Input
            type={'password'}
            size={['md', 'lg']}
            placeholder={isCommunityVersion ? 'root密码为你设置的环境变量' : '密码'}
            {...register('password', {
              required: '密码不能为空',
              maxLength: {
                value: 20,
                message: '密码最多 20 位'
              }
            })}
          ></Input>
          <FormErrorMessage position={'absolute'} fontSize="xs">
            {!!errors.password && errors.password.message}
          </FormErrorMessage>
        </FormControl>
        {feConfigs?.show_register && (
          <>
            <Flex align={'center'} justifyContent={'space-between'} mt={3} color={'blue.500'}>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('forgetPassword')}
                fontSize="sm"
              >
                忘记密码?
              </Box>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('register')}
                fontSize="sm"
              >
                注册账号
              </Box>
            </Flex>
            {feConfigs?.docUrl && (
              <Box textAlign={'center'} mt={2} fontSize={'sm'}>
                使用即代表你同意我们的{' '}
                <Link
                  href={getDocPath('/docs/agreement/disclaimer/')}
                  target={'_blank'}
                  color={'blue.500'}
                >
                  免责声明
                </Link>
              </Box>
            )}
          </>
        )}

        <Button
          type="submit"
          mt={5}
          w={'100%'}
          size={['md', 'lg']}
          colorScheme="blue"
          isLoading={requesting}
        >
          登录
        </Button>
        {feConfigs?.show_register && (
          <>
            <Flex mt={10} justifyContent={'space-around'} alignItems={'center'}>
              {oAuthList.map((item) => (
                <MyIcon
                  key={item.provider}
                  name={item.icon as any}
                  w={'34px'}
                  cursor={'pointer'}
                  color={'myGray.800'}
                  onClick={() => {
                    setLoginStore({
                      provider: item.provider,
                      lastRoute,
                      state: state.current
                    });
                    router.replace(item.redirectUrl, '_self');
                  }}
                />
              ))}
            </Flex>
          </>
        )}
      </form>
    </>
  );
};

export default LoginForm;
