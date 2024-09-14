import React, { useState, Dispatch, useCallback } from 'react';
import { FormControl, Flex, Input, Button, Box, Link } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { postLogin } from '@/web/support/user/api';
import type { ResLogin } from '@/global/support/api/userRes';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getDocPath } from '@/web/common/system/doc';
import { useTranslation } from 'next-i18next';
import FormLayout from './components/FormLayout';

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
          title: t('login:login_success'),
          status: 'success'
        });
      } catch (error: any) {
        toast({
          title: error.message || t('login:login_failed'),
          status: 'error'
        });
      }
      setRequesting(false);
    },
    [loginSuccess, t, toast]
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
      <Box
        mt={'42px'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !requesting) {
            handleSubmit(onclickLogin)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'myGray.50'}
            placeholder={placeholder}
            {...register('username', {
              required: true
            })}
          ></Input>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password}>
          <Input
            bg={'myGray.50'}
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
        {feConfigs?.docUrl && (
          <Flex alignItems={'center'} mt={7} fontSize={'mini'}>
            {t('login:policy_tip')}
            <Link
              ml={1}
              href={getDocPath('/docs/agreement/terms/')}
              target={'_blank'}
              color={'primary.500'}
            >
              {t('login:terms')}
            </Link>
            <Box mx={1}>&</Box>
            <Link
              href={getDocPath('/docs/agreement/privacy/')}
              target={'_blank'}
              color={'primary.500'}
            >
              {t('login:privacy')}
            </Link>
          </Flex>
        )}

        <Button
          type="submit"
          my={6}
          w={'100%'}
          size={['md', 'md']}
          colorScheme="blue"
          isLoading={requesting}
          onClick={handleSubmit(onclickLogin)}
        >
          {t('login:Login')}
        </Button>

        <Flex align={'center'} justifyContent={'flex-end'} color={'primary.700'}>
          {feConfigs?.find_password_method && feConfigs.find_password_method.length > 0 && (
            <Box
              cursor={'pointer'}
              _hover={{ textDecoration: 'underline' }}
              onClick={() => setPageType('forgetPassword')}
              fontSize="sm"
            >
              {t('login:forget_password')}
            </Box>
          )}
          {feConfigs?.register_method && feConfigs.register_method.length > 0 && (
            <>
              <Box mx={3} h={'16px'} w={'1.5px'} bg={'myGray.250'}></Box>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('register')}
                fontSize="sm"
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
