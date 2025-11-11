import React, { type Dispatch } from 'react';
import { FormControl, Box, Input, Button } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { postRegister } from '@/web/support/user/api';
import { useSendCode } from '@/web/support/user/hooks/useSendCode';
import type { LoginSuccessResponse } from '@/global/support/api/userRes';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  getBdVId,
  getFastGPTSem,
  getInviterId,
  getMsclkid,
  getSourceDomain,
  removeFastGPTSem
} from '@/web/support/marketing/utils';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';

interface Props {
  loginSuccess: (e: LoginSuccessResponse) => void;
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

  const { SendCodeBox, openCodeAuthModal } = useSendCode({ type: 'register' });

  const { runAsync: onclickRegister, loading: requesting } = useRequest2(
    async ({ username, password, code }: RegisterType) => {
      loginSuccess(
        await postRegister({
          username,
          code,
          password,
          inviterId: getInviterId(),
          bd_vid: getBdVId(),
          msclkid: getMsclkid(),
          fastgpt_sem: getFastGPTSem(),
          sourceDomain: getSourceDomain()
        })
      );
      removeFastGPTSem();

      toast({
        status: 'success',
        title: t('user:register.success')
      });
    },
    {
      refreshDeps: [loginSuccess, t, toast]
    }
  );
  const onSubmitErr = (err: Record<string, any>) => {
    const val = Object.values(err)[0];
    if (!val) return;
    if (val.message) {
      toast({
        status: 'warning',
        title: val.message,
        duration: 3000,
        isClosable: true
      });
    }
  };

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
          if (!openCodeAuthModal && e.key === 'Enter' && !e.shiftKey && !requesting) {
            handleSubmit(onclickRegister, onSubmitErr)();
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
            placeholder={t('login:password_tip')}
            {...register('password', {
              required: true,
              validate: (val) => {
                if (!checkPasswordRule(val)) {
                  return t('login:password_tip');
                }
                return true;
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
          />
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
          onClick={handleSubmit(onclickRegister, onSubmitErr)}
        >
          {t('user:register.confirm')}
        </Button>
        <Box
          float={'right'}
          fontSize="mini"
          mt={3}
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
