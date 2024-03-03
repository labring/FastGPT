import React, { useState, Dispatch, useCallback } from 'react';
import { FormControl, Flex, Input, Button, Box, Link } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { PageTypeEnum } from '@/constants/user';
import { postLogin } from '@/web/support/user/api';
import type { ResLogin } from '@/global/support/api/userRes';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getDocPath } from '@/web/common/system/doc';
import { useTranslation } from 'next-i18next';
import FormLayout from './components/FormLayout';

interface Props {
  setPageType: Dispatch<`${PageTypeEnum}`>;
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

  const isCommunityVersion = feConfigs?.show_register === false && feConfigs?.show_git;

  const loginOptions = [
    feConfigs?.showPhoneLogin ? '手机号' : '',
    feConfigs?.showEmailLogin ? '邮箱' : '',
    '用户名'
  ].filter(Boolean);

  const placeholder = isCommunityVersion ? '使用root用户登录' : loginOptions.join('/');

  return (
    <FormLayout setPageType={setPageType} pageType={PageTypeEnum.login}>
      <Box
        mt={'42px'}
        onKeyDown={(e) => {
          if (e.keyCode === 13 && !e.shiftKey && !requesting) {
            handleSubmit(onclickLogin)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'myGray.50'}
            placeholder={placeholder}
            {...register('username', {
              required: `${placeholder}不能为空`
            })}
          ></Input>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password}>
          <Input
            bg={'myGray.50'}
            type={'password'}
            placeholder={isCommunityVersion ? 'root密码为你设置的环境变量' : '密码'}
            {...register('password', {
              required: '密码不能为空',
              maxLength: {
                value: 20,
                message: '密码最多 20 位'
              }
            })}
          ></Input>
        </FormControl>
        {feConfigs?.docUrl && (
          <Box mt={7} fontSize={'sm'}>
            使用即代表你同意我们的{' '}
            <Link
              href={getDocPath('/docs/agreement/disclaimer/')}
              target={'_blank'}
              color={'primary.500'}
            >
              免责声明
            </Link>
          </Box>
        )}

        <Button
          type="submit"
          my={6}
          w={'100%'}
          size={['md', 'lg']}
          colorScheme="blue"
          isLoading={requesting}
          onClick={handleSubmit(onclickLogin)}
        >
          {t('home.Login')}
        </Button>

        {feConfigs?.show_register && (
          <>
            <Flex align={'center'} justifyContent={'flex-end'} color={'primary.700'}>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('forgetPassword')}
                fontSize="sm"
              >
                忘记密码?
              </Box>
              <Box mx={3} h={'16px'} w={'1.5px'} bg={'myGray.250'}></Box>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('register')}
                fontSize="sm"
              >
                注册账号
              </Box>
            </Flex>
          </>
        )}
      </Box>
    </FormLayout>
  );
};

export default LoginForm;
