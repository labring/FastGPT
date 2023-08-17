import React, { useState, Dispatch, useCallback } from 'react';
import { FormControl, Flex, Input, Button, FormErrorMessage, Box } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { PageTypeEnum } from '@/constants/user';
import { postLogin } from '@/api/user';
import type { ResLogin } from '@/api/response/user';
import { useToast } from '@/hooks/useToast';
import { feConfigs } from '@/store/static';
import { useGlobalStore } from '@/store/global';
import MyIcon from '@/components/Icon';

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
  const { setLoginStore } = useGlobalStore();
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

  const onclickGit = useCallback(() => {
    setLoginStore({
      provider: 'git',
      lastRoute
    });
    router.replace(
      `https://github.com/login/oauth/authorize?client_id=${
        feConfigs?.gitLoginKey
      }&redirect_uri=${`${location.origin}/login/provider`}&scope=user:email%20read:user`,
      '_self'
    );
  }, [lastRoute, setLoginStore]);

  return (
    <>
      <Box fontWeight={'bold'} fontSize={'2xl'} textAlign={'center'}>
        登录 {feConfigs?.systemTitle}
      </Box>
      <form onSubmit={handleSubmit(onclickLogin)}>
        <FormControl mt={8} isInvalid={!!errors.username}>
          <Input
            placeholder="邮箱/手机号/用户名"
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
            placeholder="密码"
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
          <Flex align={'center'} justifyContent={'space-between'} mt={3} color={'myBlue.600'}>
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
        )}
        <Button
          type="submit"
          mt={6}
          w={'100%'}
          size={['md', 'lg']}
          colorScheme="blue"
          isLoading={requesting}
        >
          登录
        </Button>
        {feConfigs?.show_register && (
          <>
            <Flex mt={10} justifyContent={'center'} alignItems={'center'}>
              <MyIcon
                name="gitFill"
                w={'34px'}
                cursor={'pointer'}
                color={'myGray.800'}
                onClick={onclickGit}
              />
            </Flex>
          </>
        )}
      </form>
    </>
  );
};

export default LoginForm;
