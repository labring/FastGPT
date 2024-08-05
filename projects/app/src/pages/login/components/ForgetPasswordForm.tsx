import React, { useState, Dispatch, useCallback } from 'react';
import { FormControl, Box, Input, Button } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { postFindPassword } from '@/web/support/user/api';
import { useSendCode } from '@/web/support/user/hooks/useSendCode';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
interface Props {
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  loginSuccess: (e: ResLogin) => void;
}

interface RegisterType {
  username: string;
  code: string;
  password: string;
  password2: string;
}

const RegisterForm = ({ setPageType, loginSuccess }: Props) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    formState: { errors }
  } = useForm<RegisterType>({
    mode: 'onBlur'
  });

  const { codeSending, sendCodeText, sendCode, codeCountDown } = useSendCode();

  const onclickSendCode = useCallback(async () => {
    const check = await trigger('username');
    if (!check) return;
    sendCode({
      username: getValues('username'),
      type: 'findPassword'
    });
  }, [getValues, sendCode, trigger]);

  const [requesting, setRequesting] = useState(false);

  const onclickFindPassword = useCallback(
    async ({ username, code, password }: RegisterType) => {
      setRequesting(true);
      try {
        loginSuccess(
          await postFindPassword({
            username,
            code,
            password
          })
        );
        toast({
          title: t('user:password.retrieved'),
          status: 'success'
        });
      } catch (error: any) {
        toast({
          title: error.message || t('user:password.change_error'),
          status: 'error'
        });
      }
      setRequesting(false);
    },
    [loginSuccess, toast]
  );

  return (
    <>
      <Box fontWeight={'bold'} fontSize={'2xl'} textAlign={'center'}>
        {t('user:password.retrieved_account', { account: feConfigs?.systemTitle })}
      </Box>
      <Box
        mt={'42px'}
        onKeyDown={(e) => {
          if (e.keyCode === 13 && !e.shiftKey && !requesting) {
            handleSubmit(onclickFindPassword)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'myGray.50'}
            placeholder={t('user:password.email_phone')}
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
            bg={'myGray.50'}
            flex={1}
            maxLength={8}
            placeholder={t('user:password.verification_code')}
            {...register('code', {
              required: t('user:password.code_required')
            })}
          ></Input>
          <Box
            position={'absolute'}
            right={3}
            zIndex={1}
            fontSize={'sm'}
            {...(codeCountDown > 0
              ? {
                  color: 'myGray.500'
                }
              : {
                  color: 'primary.700',
                  cursor: 'pointer',
                  onClick: onclickSendCode
                })}
          >
            {sendCodeText}
          </Box>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password}>
          <Input
            bg={'myGray.50'}
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
          mt={10}
          w={'100%'}
          size={['md', 'md']}
          colorScheme="blue"
          isLoading={requesting}
          onClick={handleSubmit(onclickFindPassword)}
        >
          {t('user:password.retrieve')}
        </Button>
        <Box
          float={'right'}
          fontSize="sm"
          mt={2}
          mb={'50px'}
          color={'primary.700'}
          cursor={'pointer'}
          _hover={{ textDecoration: 'underline' }}
          onClick={() => setPageType(LoginPageTypeEnum.passwordLogin)}
        >
          {t('user:password.to_login')}
        </Box>
      </Box>
    </>
  );
};

export default RegisterForm;
