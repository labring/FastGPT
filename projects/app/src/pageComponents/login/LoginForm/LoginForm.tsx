import React, { type Dispatch, useCallback, useState } from 'react';
import {
  FormControl,
  Flex,
  Input,
  Button,
  Box,
  Text,
  VStack,
  Modal,
  ModalOverlay,
  ModalContent
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import {
  postLogin,
  getPreLogin,
  getLoginVerificationCaptcha,
  sendLoginVerificationCode,
  verifyLoginVerificationCode
} from '@/web/support/user/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import FormLayout from './FormLayout';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSearchParams } from 'next/navigation';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { useRouter } from 'next/router';
import { useMount } from 'ahooks';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import type {
  LoginSuccessResponseType,
  LoginVerificationRequiredResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import PolicyTip from './PolicyTip';
import { getRegisterMethods } from '@/web/common/system/utils';
import { getFastGPTSem, onFastGPTLoginSuccess } from '@/web/support/marketing/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AccountVerificationPanel } from '@/components/support/user/safe/AccountVerificationPanel';

type LoginSuccessHandler = (res: LoginSuccessResponseType) => void | Promise<void>;

interface Props {
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  loginSuccess: LoginSuccessHandler;
}

interface LoginFormType {
  username: string;
  password: string;
}

const LoginVerificationModal = ({
  children,
  onClose,
  backLabel
}: {
  children: React.ReactNode;
  onClose: () => void;
  backLabel: string;
}) => (
  <Modal
    isOpen
    onClose={onClose}
    isCentered
    autoFocus={false}
    blockScrollOnMount={false}
    allowPinchZoom
    scrollBehavior="inside"
    closeOnOverlayClick={false}
    returnFocusOnClose={false}
  >
    <ModalOverlay bg="transparent" pointerEvents="none" />
    <Button
      position="fixed"
      top="24px"
      left="24px"
      zIndex={1500}
      h="32px"
      minW={0}
      p={0}
      variant="unstyled"
      display="flex"
      alignItems="center"
      gap={1}
      color="primary.600"
      fontSize="20px"
      fontWeight="normal"
      lineHeight="32px"
      onClick={onClose}
      aria-label={backLabel}
    >
      <MyIcon name="common/arrowLeft" w="24px" h="24px" />
      <Box>{backLabel}</Box>
    </Button>
    <ModalContent
      w={['calc(100% - 40px)', '560px']}
      maxW={['calc(100vw - 40px)', '560px']}
      maxH="80vh"
      borderRadius={['12px', '16px']}
      boxShadow="0px 16px 40px rgba(30, 64, 175, 0.10), 0px 1px 3px rgba(15, 23, 42, 0.06)"
      display="flex"
      flexDirection="column"
    >
      <Box flex="1 1 auto" minH={0} overflowY="auto" px={[6, '90px']} py={[10, '90px']}>
        {children}
      </Box>
    </ModalContent>
  </Modal>
);

const LoginForm = ({ setPageType, loginSuccess }: Props) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const query = useSearchParams();
  const router = useRouter();
  const registerMethods = getRegisterMethods(feConfigs);
  const hasRegisterMethod = registerMethods.length > 0;
  const hasFindPasswordMethod = !!feConfigs?.find_password_method?.length;
  const [loginVerification, setLoginVerification] =
    useState<LoginVerificationRequiredResponseType>();

  const backToLogin = useCallback(() => {
    setLoginVerification(undefined);
    void router.replace('/login');
  }, [router]);

  /**
   * 清理自动登录（?u=&p=）带入地址栏的明文密码。
   * 二次验证阶段最长会持续 5 分钟，密码留在 URL 和浏览器历史里风险过高，
   * 因此在进入验证码弹窗前就替换掉当前历史记录。
   * 这里用 shallow 替换：只需要改 URL，不必重新拉取页面数据，
   * 也避免整页导航打断已经打开的验证码弹窗状态。
   */
  const clearAutoLoginQuery = useCallback(() => {
    if (!router.query.u && !router.query.p) return;
    void router.replace(
      router.pathname,
      {
        query: {
          ...router.query,
          u: '',
          p: ''
        }
      },
      {
        shallow: true
      }
    );
  }, [router]);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormType>();

  const finishLogin = useCallback(
    async (response: LoginSuccessResponseType) => {
      await onFastGPTLoginSuccess(loginSuccess, response);
      toast({
        status: 'success',
        title: t('login:login_success')
      });
    },
    [loginSuccess, t, toast]
  );

  const { runAsync: onclickLogin, loading: requesting } = useRequest(
    async ({ username, password }: LoginFormType) => {
      setLoginVerification(undefined);
      const { code } = await getPreLogin(username);
      const loginResponse = await postLogin({
        username,
        password,
        code,
        fastgpt_sem: getFastGPTSem(),
        language: i18n.language as LangEnum
      });
      if ('status' in loginResponse) {
        // 密码校验通过但还要走二次验证，先清理自动登录明文密码再展示验证码弹窗
        clearAutoLoginQuery();
        setLoginVerification(loginResponse);
      } else {
        await finishLogin(loginResponse);
      }
    },
    {
      refreshDeps: [finishLogin],
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

  const createLoginCodeVerification = useCallback(
    async (captcha: string) => {
      if (!loginVerification) throw new Error('Login verification is unavailable');
      await sendLoginVerificationCode({
        challenge: loginVerification.challenge,
        captcha
      });
    },
    [loginVerification]
  );

  const submitLoginCodeVerification = useCallback(
    async (code: string) => {
      if (!loginVerification) throw new Error('Login verification is unavailable');
      const response = await verifyLoginVerificationCode({
        challenge: loginVerification.challenge,
        code
      });
      await finishLogin(response);
      setLoginVerification(undefined);
      return 'verified' as const;
    },
    [finishLogin, loginVerification]
  );

  const getLoginCaptcha = useCallback(async () => {
    if (!loginVerification) throw new Error('Login verification is unavailable');
    return getLoginVerificationCaptcha(loginVerification.challenge);
  }, [loginVerification]);

  const isCommunityVersion = hasRegisterMethod && !feConfigs?.isPlus;

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
    <>
      {!loginVerification && (
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

            {(hasFindPasswordMethod || hasRegisterMethod) && (
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
                {hasFindPasswordMethod && (
                  <Box
                    cursor={'pointer'}
                    _hover={{ textDecoration: 'underline' }}
                    onClick={() => setPageType('forgetPassword')}
                    fontSize="mini"
                  >
                    {t('login:forget_password')}
                  </Box>
                )}
                {hasFindPasswordMethod && hasRegisterMethod && (
                  <Box
                    display={['block', 'block']}
                    mx={3}
                    h={'12px'}
                    w={'1px'}
                    bg={'myGray.250'}
                  ></Box>
                )}
                {hasRegisterMethod && (
                  <Box
                    cursor={'pointer'}
                    _hover={{ textDecoration: 'underline' }}
                    onClick={() => setPageType('register')}
                    fontSize="mini"
                    lineHeight="16px"
                  >
                    {t('login:register')}
                  </Box>
                )}
              </Flex>
            )}
          </Box>
        </FormLayout>
      )}
      {loginVerification && (
        <LoginVerificationModal onClose={backToLogin} backLabel={t('common:back', '返回')}>
          <VStack w="100%" align="stretch" spacing={0}>
            <Text fontSize="20px" fontWeight="500" lineHeight="30px" textAlign="center">
              {t('common:password_verification_title')}
            </Text>
            <Box pt={9}>
              <AccountVerificationPanel
                method="code"
                purpose="login"
                username={loginVerification.maskedTarget}
                getCaptchaPic={getLoginCaptcha}
                createCodeVerification={createLoginCodeVerification}
                submitCodeVerification={submitLoginCodeVerification}
              />
            </Box>
          </VStack>
        </LoginVerificationModal>
      )}
    </>
  );
};

export default LoginForm;
