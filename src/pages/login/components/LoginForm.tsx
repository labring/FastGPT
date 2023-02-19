import React, { useState, Dispatch, useCallback } from 'react';
import { FormControl, Flex, Input, Button, FormErrorMessage, Box } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { PageTypeEnum } from '@/constants/user';
import { postLogin } from '@/api/user';
import type { ResLogin } from '@/api/response/user';
import { useToast } from '@/hooks/useToast';
import { useScreen } from '@/hooks/useScreen';

interface Props {
  setPageType: Dispatch<`${PageTypeEnum}`>;
  loginSuccess: (e: ResLogin) => void;
}

interface LoginFormType {
  email: string;
  password: string;
}

const LoginForm = ({ setPageType, loginSuccess }: Props) => {
  const { toast } = useToast();
  const { mediaLgMd } = useScreen();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormType>();

  const [requesting, setRequesting] = useState(false);

  const onclickLogin = useCallback(
    async ({ email, password }: LoginFormType) => {
      setRequesting(true);
      try {
        loginSuccess(
          await postLogin({
            email,
            password
          })
        );
        toast({
          title: '登录成功',
          status: 'success'
        });
      } catch (error) {
        typeof error === 'string' &&
          toast({
            title: error,
            status: 'error',
            position: 'top'
          });
      }
      setRequesting(false);
    },
    [loginSuccess, toast]
  );

  return (
    <>
      <Box fontWeight={'bold'} fontSize={'2xl'} textAlign={'center'}>
        登录 DocGPT
      </Box>
      <form onSubmit={handleSubmit(onclickLogin)}>
        <FormControl mt={8} isInvalid={!!errors.email}>
          <Input
            placeholder="邮箱"
            size={mediaLgMd}
            {...register('email', {
              required: '邮箱不能为空',
              pattern: {
                value: /^[A-Za-z0-9]+([_\.][A-Za-z0-9]+)*@([A-Za-z0-9\-]+\.)+[A-Za-z]{2,6}$/,
                message: '邮箱错误'
              }
            })}
          ></Input>
          <FormErrorMessage position={'absolute'} fontSize="xs">
            {!!errors.email && errors.email.message}
          </FormErrorMessage>
        </FormControl>
        <FormControl mt={8} isInvalid={!!errors.password}>
          <Input
            type={'password'}
            size={mediaLgMd}
            placeholder="密码"
            {...register('password', {
              required: '密码不能为空',
              minLength: {
                value: 4,
                message: '密码最少4位最多12位'
              },
              maxLength: {
                value: 12,
                message: '密码最少4位最多12位'
              }
            })}
          ></Input>
          <FormErrorMessage position={'absolute'} fontSize="xs">
            {!!errors.password && errors.password.message}
          </FormErrorMessage>
        </FormControl>
        <Flex align={'center'} justifyContent={'space-between'} mt={6} color={'blue.600'}>
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
        <Button
          type="submit"
          mt={8}
          w={'100%'}
          size={mediaLgMd}
          colorScheme="blue"
          isLoading={requesting}
        >
          登录
        </Button>
      </form>
    </>
  );
};

export default LoginForm;
