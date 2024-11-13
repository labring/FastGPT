import React, { Dispatch } from 'react';
import { FormControl, Box, Input, Button } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { postRegister } from '@/web/support/user/api';
import { useSendCode } from '@/web/support/user/hooks/useSendCode';
import type { ResLogin } from '@/global/support/api/userRes';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { postCreateApp } from '@/web/core/app/api';
import { emptyTemplates } from '@/web/core/app/templates';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

interface Props {
  loginSuccess: (e: ResLogin) => void;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
}

interface RegisterType {
  username: string;
  password: string;
  password2: string;
  code: string;
}

const RegisterForm = ({ setPageType, loginSuccess }: Props) => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const { feConfigs } = useSystemStore();
  const {
    register,
    handleSubmit,
    getValues,
    watch,
    formState: { errors }
  } = useForm<RegisterType>({
    mode: 'onBlur'
  });
  const username = watch('username');

  const { SendCodeBox } = useSendCode({ type: 'register' });

  const { runAsync: onclickRegister, loading: requesting } = useRequest2(
    async ({ username, password, code }: RegisterType) => {
      const fastgpt_sem = (() => {
        try {
          return sessionStorage.getItem('fastgpt_sem')
            ? JSON.parse(sessionStorage.getItem('fastgpt_sem')!)
            : undefined;
        } catch {
          return undefined;
        }
      })();

      loginSuccess(
        await postRegister({
          username,
          code,
          password,
          inviterId: localStorage.getItem('inviterId') || undefined,
          bd_vid: sessionStorage.getItem('bd_vid') || undefined,
          fastgpt_sem: fastgpt_sem
        })
      );

      toast({
        status: 'success',
        title: t('user:register.success')
      });

      // auto register template app
      setTimeout(() => {
        Object.entries(emptyTemplates).map(([type, emptyTemplate]) => {
          postCreateApp({
            avatar: emptyTemplate.avatar,
            name: t(emptyTemplate.name as any),
            modules: emptyTemplate.nodes,
            edges: emptyTemplate.edges,
            type: type as AppTypeEnum
          });
        });
      }, 100);
    },
    {
      refreshDeps: [loginSuccess, t, toast]
    }
  );

  const placeholder = feConfigs?.register_method
    ?.map((item) => {
      switch (item) {
        case 'email':
          return t('common:support.user.login.Email');
        case 'phone':
          return t('common:support.user.login.Phone number');
      }
    })
    .join('/');

  return (
    <>
      <Box fontWeight={'medium'} fontSize={'lg'} textAlign={'center'} color={'myGray.900'}>
        {t('user:register.register_account', { account: feConfigs?.systemTitle })}
      </Box>
      <Box
        mt={9}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !requesting) {
            handleSubmit(onclickRegister)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'myGray.50'}
            size={'lg'}
            placeholder={placeholder}
            {...register('username', {
              required: t('user:password.email_phone_void'),
              pattern: {
                value:
                  /(^1[3456789]\d{9}$)|(^[A-Za-z0-9]+([_\.][A-Za-z0-9]+)*@([A-Za-z0-9\-]+\.)+[A-Za-z]{2,6}$)/,
                message: t('user:password.email_phone_error')
              }
            })}
          ></Input>
        </FormControl>
        <FormControl
          mt={6}
          isInvalid={!!errors.code}
          display={'flex'}
          alignItems={'center'}
          position={'relative'}
        >
          <Input
            size={'lg'}
            bg={'myGray.50'}
            flex={1}
            maxLength={8}
            placeholder={t('user:password.verification_code')}
            {...register('code', {
              required: t('user:password.code_required')
            })}
          ></Input>
          <SendCodeBox username={username} />
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password}>
          <Input
            bg={'myGray.50'}
            size={'lg'}
            type={'password'}
            placeholder={t('user:password.new_password')}
            {...register('password', {
              required: t('user:password.password_required'),
              minLength: {
                value: 4,
                message: t('user:password.password_condition')
              },
              maxLength: {
                value: 20,
                message: t('user:password.password_condition')
              }
            })}
          ></Input>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password2}>
          <Input
            bg={'myGray.50'}
            size={'lg'}
            type={'password'}
            placeholder={t('user:password.confirm')}
            {...register('password2', {
              validate: (val) =>
                getValues('password') === val ? true : t('user:password.not_match')
            })}
          ></Input>
        </FormControl>
        <Button
          type="submit"
          mt={12}
          w={'100%'}
          size={['md', 'md']}
          rounded={['md', 'md']}
          h={[10, 10]}
          fontWeight={['medium', 'medium']}
          colorScheme="blue"
          isLoading={requesting}
          onClick={handleSubmit(onclickRegister)}
        >
          {t('user:register.confirm')}
        </Button>
        <Box
          float={'right'}
          fontSize="mini"
          mt={3}
          mb={'50px'}
          fontWeight={'medium'}
          color={'primary.700'}
          cursor={'pointer'}
          _hover={{ textDecoration: 'underline' }}
          onClick={() => setPageType(LoginPageTypeEnum.passwordLogin)}
        >
          {t('user:register.to_login')}
        </Box>
      </Box>
    </>
  );
};

export default RegisterForm;
