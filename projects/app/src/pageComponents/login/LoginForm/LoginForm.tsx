import React, { type Dispatch } from 'react';
import { FormControl, Input, Button, Box } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { postLogin, getPreLogin } from '@/web/support/user/api';
import type { ResLogin } from '@/global/support/api/userRes';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import { useTranslation } from 'next-i18next';
import FormLayout from './FormLayout';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

interface Props {
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  loginSuccess: (e: ResLogin) => void;
}

interface LoginFormType {
  username: string;
  password: string;
}

const LoginForm = ({ setPageType, loginSuccess }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormType>();

  const { runAsync: onclickLogin, loading: requesting } = useRequest2(
    async ({ username, password }: LoginFormType) => {
      const { code } = await getPreLogin(username);
      loginSuccess(
        await postLogin({
          username,
          password,
          code
        })
      );
      toast({
        title: t('login:login_success'),
        status: 'success'
      });
    },
    {
      refreshDeps: [loginSuccess]
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

  return (
    <FormLayout setPageType={setPageType} pageType={LoginPageTypeEnum.passwordLogin}>
      {/* 欢迎标题 */}
      <Box textAlign={'center'} mb={8}>
        <Box
          fontSize={['2xl', '3xl']}
          fontWeight={'700'}
          color={'#1a4480'}
          mb={2}
          letterSpacing={'-0.5px'}
        >
          欢迎回来
        </Box>
        <Box fontSize={['sm', 'md']} color={'rgba(26, 68, 128, 0.7)'} fontWeight={'500'}>
          请登录您的账户以继续使用
        </Box>
      </Box>

      <Box
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !requesting) {
            handleSubmit(onclickLogin)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'rgba(74, 144, 226, 0.05)'}
            border={'2px solid transparent'}
            borderRadius={'12px'}
            size={'lg'}
            h={'56px'}
            fontSize={'16px'}
            placeholder={placeholder}
            _placeholder={{
              color: 'rgba(26, 68, 128, 0.6)',
              fontSize: '16px'
            }}
            _hover={{
              bg: 'rgba(74, 144, 226, 0.08)',
              borderColor: 'rgba(74, 144, 226, 0.3)'
            }}
            _focus={{
              bg: 'rgba(74, 144, 226, 0.08)',
              borderColor: '#4a90e2',
              boxShadow: '0 0 0 3px rgba(74, 144, 226, 0.1)'
            }}
            _invalid={{
              borderColor: '#e53e3e',
              boxShadow: '0 0 0 3px rgba(229, 62, 62, 0.1)'
            }}
            transition={'all 0.2s ease'}
            {...register('username', {
              required: true
            })}
          ></Input>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password}>
          <Input
            bg={'rgba(74, 144, 226, 0.05)'}
            border={'2px solid transparent'}
            borderRadius={'12px'}
            size={'lg'}
            h={'56px'}
            fontSize={'16px'}
            type={'password'}
            placeholder={
              isCommunityVersion
                ? t('login:root_password_placeholder')
                : t('common:support.user.login.Password')
            }
            _placeholder={{
              color: 'rgba(26, 68, 128, 0.6)',
              fontSize: '16px'
            }}
            _hover={{
              bg: 'rgba(74, 144, 226, 0.08)',
              borderColor: 'rgba(74, 144, 226, 0.3)'
            }}
            _focus={{
              bg: 'rgba(74, 144, 226, 0.08)',
              borderColor: '#4a90e2',
              boxShadow: '0 0 0 3px rgba(74, 144, 226, 0.1)'
            }}
            _invalid={{
              borderColor: '#e53e3e',
              boxShadow: '0 0 0 3px rgba(229, 62, 62, 0.1)'
            }}
            transition={'all 0.2s ease'}
            {...register('password', {
              required: true,
              maxLength: {
                value: 60,
                message: t('login:password_condition')
              }
            })}
          ></Input>
        </FormControl>

        <Button
          type="submit"
          mt={8}
          mb={6}
          w={'100%'}
          h={'56px'}
          fontSize={'16px'}
          fontWeight={'600'}
          bg={'linear-gradient(135deg, #4a90e2 0%, #2c5aa0 100%)'}
          color={'white'}
          borderRadius={'12px'}
          border={'none'}
          boxShadow={
            '0px 8px 24px rgba(74, 144, 226, 0.3), inset 0px 1px 0px rgba(255, 255, 255, 0.2)'
          }
          _hover={{
            bg: 'linear-gradient(135deg, #5ba0f2 0%, #3c6ab0 100%)',
            boxShadow:
              '0px 12px 32px rgba(74, 144, 226, 0.4), inset 0px 1px 0px rgba(255, 255, 255, 0.3)',
            transform: 'translateY(-2px)'
          }}
          _active={{
            bg: 'linear-gradient(135deg, #3a80d2 0%, #1c4a90 100%)',
            boxShadow: '0px 4px 16px rgba(74, 144, 226, 0.2), inset 0px 2px 4px rgba(0, 0, 0, 0.1)',
            transform: 'translateY(0px)'
          }}
          _loading={{
            bg: 'linear-gradient(135deg, #4a90e2 0%, #2c5aa0 100%)',
            opacity: 0.8
          }}
          transition={'all 0.2s ease'}
          isLoading={requesting}
          loadingText={t('login:Login')}
          onClick={handleSubmit(onclickLogin)}
        >
          {t('login:Login')}
        </Button>
      </Box>
    </FormLayout>
  );
};

export default LoginForm;
