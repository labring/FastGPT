import React, { type Dispatch } from 'react';
import { FormControl, Flex, Input, Button, Box } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { postLogin, getPreLogin } from '@/web/support/user/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import FormLayout from './FormLayout';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSearchParams } from 'next/navigation';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { useRouter } from 'next/router';
import { useMount } from 'ahooks';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import PolicyTip from './PolicyTip';

type LoginSuccessHandler = (res: LoginSuccessResponseType) => void | Promise<void>;

interface Props {
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  loginSuccess: LoginSuccessHandler;
}

interface LoginFormType {
  username: string;
  password: string;
}

const LoginForm = ({ setPageType, loginSuccess }: Props) => {
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const query = useSearchParams();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormType>();

  const { runAsync: onclickLogin, loading: requesting } = useRequest(
    async ({ username, password }: LoginFormType) => {
      const { code } = await getPreLogin(username);
      const loginResponse = await postLogin({
        username,
        password,
        code,
        language: i18n.language as LangEnum
      });
      await loginSuccess(loginResponse);
    },
    {
      refreshDeps: [loginSuccess],
      successToast: t('login:login_success'),
      onError: (error: any) => {
        // 密码错误，需要清空 query 参数
        if (error.statusText === UserErrEnum.account_psw_error) {
          router.replace(
            router.pathname,
            {
              query: {
                ...router.query,
                u: '',
                p: ''
              }
            },
            {
              shallow: false
            }
          );
        }
      }
    }
  );

  const isCommunityVersion = !!(feConfigs?.register_method && !feConfigs?.isPlus);

  const placeholder = (() => {
    if (isCommunityVersion) {
      return t('login:use_root_login');
    }
    return [t('common:support.user.login.Username')]
      .concat(
        feConfigs?.login_method?.map((item) => {
          switch (item) {
            case 'email':
              return t('common:support.user.login.Email');
            case 'phone':
              return t('common:support.user.login.Phone number');
          }
        }) ?? []
      )
      .join('/');
  })();

  useMount(() => {
    const username = query.get('u');
    const password = query.get('p');
    if (username && password) {
      onclickLogin({
        username,
        password
      });
    }
  });

  return (
    <FormLayout setPageType={setPageType} pageType={LoginPageTypeEnum.passwordLogin}>
      <Box
        mt={[0, 8]}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !requesting) {
            handleSubmit(onclickLogin)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'white'}
            size={'lg'}
            placeholder={placeholder}
            {...register('username', {
              required: true
            })}
          ></Input>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password}>
          <Input
            bg={'white'}
            size={'lg'}
            type={'password'}
            placeholder={
              isCommunityVersion
                ? t('login:root_password_placeholder')
                : t('common:support.user.login.Password')
            }
            {...register('password', {
              required: true,
              maxLength: {
                value: 60,
                message: t('login:password_condition')
              }
            })}
          ></Input>
        </FormControl>
        <PolicyTip />
        <Button
          type="submit"
          mt={6}
          w={'100%'}
          size={'lg'}
          fontWeight={['medium', 'medium']}
          colorScheme="blue"
          isLoading={requesting}
          onClick={handleSubmit(onclickLogin)}
        >
          {t('login:Login')}
        </Button>

        <Flex
          mt={6}
          align={'center'}
          justifyContent={'center'}
          gap={0}
          color={'primary.700'}
          fontWeight={'medium'}
          h={'16px'}
          lineHeight={'16px'}
        >
          {feConfigs?.find_password_method && feConfigs.find_password_method.length > 0 && (
            <Box
              cursor={'pointer'}
              _hover={{ textDecoration: 'underline' }}
              onClick={() => setPageType('forgetPassword')}
              fontSize="mini"
            >
              {t('login:forget_password')}
            </Box>
          )}
          {feConfigs?.register_method && feConfigs.register_method.length > 0 && (
            <>
              <Box display={['block', 'block']} mx={3} h={'12px'} w={'1px'} bg={'myGray.250'}></Box>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('register')}
                fontSize="mini"
                lineHeight="16px"
              >
                {t('login:register')}
              </Box>
            </>
          )}
        </Flex>
      </Box>
    </FormLayout>
  );
};

export default LoginForm;
