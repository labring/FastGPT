import React, { type Dispatch } from 'react';
import { Box, Button, FormControl, Input } from '@chakra-ui/react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { VerificationCodeTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';
import {
  AccountEmailUsernameSchema,
  AccountPhoneUsernameSchema
} from '@fastgpt/global/support/user/account/verification/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getLoginMethods } from '@/web/common/system/utils';
import {
  getBdVId,
  getFastGPTSem,
  getMsclkid,
  onFastGPTLoginSuccess
} from '@/web/support/marketing/utils';
import { postLoginByCode } from '@/web/support/user/api';
import { useSendCode } from '@/web/support/user/hooks/useSendCode';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import FormLayout from './FormLayout';
import PolicyTip from './PolicyTip';

type LoginSuccessHandler = (res: LoginSuccessResponseType) => void | Promise<void>;

type Props = {
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  loginSuccess: LoginSuccessHandler;
};

type CodeLoginFormType = {
  username: string;
  code: string;
};

/**
 * 邮箱/手机号验证码登录表单；未注册账号验证通过后由服务端自动创建空密码账号。
 */
const CodeLoginForm = ({ setPageType, loginSuccess }: Props) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const codeLoginMethods = getLoginMethods(feConfigs);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<CodeLoginFormType>({
    mode: 'onBlur'
  });
  const username = useWatch({ control, name: 'username' }) ?? '';

  const validateUsername = (value: string) => {
    const method = (() => {
      if (AccountEmailUsernameSchema.safeParse(value).success) return 'email';
      if (AccountPhoneUsernameSchema.safeParse(value).success) return 'phone';
    })();

    if (!method) return t('user:password.email_phone_error');
    return codeLoginMethods.includes(method) || t('common:error.registration_method_not_supported');
  };

  const { SendCodeBox, openCodeAuthModal } = useSendCode({
    type: VerificationCodeTypeEnum.login,
    purpose: 'login',
    validateBeforeSend: validateUsername
  });

  const { runAsync: onclickLogin, loading: requesting } = useRequest(
    async ({ username, code }: CodeLoginFormType) => {
      const loginResponse = await postLoginByCode({
        username: username.trim(),
        code: code.trim(),
        bd_vid: getBdVId(),
        msclkid: getMsclkid(),
        fastgpt_sem: getFastGPTSem(),
        language: i18n.language as LangEnum
      });
      await onFastGPTLoginSuccess(loginSuccess, loginResponse);

      toast({
        status: 'success',
        title: t('login:login_success')
      });
    },
    {
      refreshDeps: [i18n.language, loginSuccess, t, toast]
    }
  );

  const onSubmitErr = (err: Record<string, { message?: string } | undefined>) => {
    const val = Object.values(err)[0];
    if (!val?.message) return;
    toast({
      status: 'warning',
      title: val.message,
      duration: 3000,
      isClosable: true
    });
  };

  const placeholder = codeLoginMethods
    .map((item) => {
      switch (item) {
        case 'email':
          return t('common:support.user.login.Email');
        case 'phone':
          return t('common:support.user.login.Phone number');
      }
    })
    .join('/');

  return (
    <FormLayout setPageType={setPageType} pageType={LoginPageTypeEnum.codeLogin}>
      <Box
        mt={[0, 8]}
        onKeyDown={(e) => {
          // 旋转验证码弹窗打开或输入法组合态时，回车不应触发外层表单提交。
          if (
            !openCodeAuthModal &&
            e.key === 'Enter' &&
            !e.nativeEvent.isComposing &&
            e.keyCode !== 229 &&
            !e.shiftKey &&
            !requesting
          ) {
            handleSubmit(onclickLogin, onSubmitErr)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'white'}
            size={'lg'}
            placeholder={placeholder}
            {...register('username', {
              required: t('user:password.email_phone_void'),
              validate: validateUsername
            })}
          />
        </FormControl>
        <FormControl
          mt={6}
          isInvalid={!!errors.code}
          display={'flex'}
          alignItems={'center'}
          position={'relative'}
        >
          <Input
            bg={'white'}
            size={'lg'}
            flex={1}
            maxLength={8}
            placeholder={t('user:password.verification_code')}
            {...register('code', {
              required: t('user:password.code_required')
            })}
          />
          <SendCodeBox username={username.trim()} />
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
          onClick={handleSubmit(onclickLogin, onSubmitErr)}
        >
          {t('login:Login')}
        </Button>

        <Box mt={3} fontSize={'mini'} lineHeight={'16px'} color={'myGray.500'} textAlign={'center'}>
          {t('login:code_login_auto_register_tip')}
        </Box>
      </Box>
    </FormLayout>
  );
};

export default CodeLoginForm;
