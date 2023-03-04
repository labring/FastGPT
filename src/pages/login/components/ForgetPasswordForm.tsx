import React, { useState, Dispatch, useCallback } from 'react';
import { FormControl, Box, Input, Button, FormErrorMessage, Flex } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { PageTypeEnum } from '../../../constants/user';
import { postFindPassword } from '@/api/user';
import { useSendCode } from '@/hooks/useSendCode';
import type { ResLogin } from '@/api/response/user';
import { useScreen } from '@/hooks/useScreen';
import { useToast } from '@/hooks/useToast';

interface Props {
  setPageType: Dispatch<`${PageTypeEnum}`>;
  loginSuccess: (e: ResLogin) => void;
}

interface RegisterType {
  email: string;
  code: string;
  password: string;
  password2: string;
}

const RegisterForm = ({ setPageType, loginSuccess }: Props) => {
  const { toast } = useToast();
  const { mediaLgMd } = useScreen();
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
    const check = await trigger('email');
    if (!check) return;
    sendCode({
      email: getValues('email'),
      type: 'findPassword'
    });
  }, [getValues, sendCode, trigger]);

  const [requesting, setRequesting] = useState(false);

  const onclickFindPassword = useCallback(
    async ({ email, code, password }: RegisterType) => {
      setRequesting(true);
      try {
        toast({
          title: `密码已找回`,
          status: 'success'
        });
        loginSuccess(
          await postFindPassword({
            email,
            code,
            password
          })
        );
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
        找回 DocGPT 账号
      </Box>
      <form onSubmit={handleSubmit(onclickFindPassword)}>
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
        <FormControl mt={8} isInvalid={!!errors.email}>
          <Flex>
            <Input
              flex={1}
              placeholder="验证码"
              size={mediaLgMd}
              {...register('code', {
                required: '验证码不能为空'
              })}
            ></Input>
            <Button
              ml={5}
              w={'145px'}
              maxW={'50%'}
              size={mediaLgMd}
              onClick={onclickSendCode}
              isDisabled={codeCountDown > 0}
              isLoading={codeSending}
            >
              {sendCodeText}
            </Button>
          </Flex>
          <FormErrorMessage position={'absolute'} fontSize="xs">
            {!!errors.code && errors.code.message}
          </FormErrorMessage>
        </FormControl>
        <FormControl mt={8} isInvalid={!!errors.password}>
          <Input
            type={'password'}
            placeholder="新密码"
            size={mediaLgMd}
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
        <FormControl mt={8} isInvalid={!!errors.password2}>
          <Input
            type={'password'}
            placeholder="确认密码"
            size={mediaLgMd}
            {...register('password2', {
              validate: (val) => (getValues('password') === val ? true : '两次密码不一致')
            })}
          ></Input>
          <FormErrorMessage position={'absolute'} fontSize="xs">
            {!!errors.password2 && errors.password2.message}
          </FormErrorMessage>
        </FormControl>
        <Box
          float={'right'}
          fontSize="sm"
          mt={2}
          color={'blue.600'}
          cursor={'pointer'}
          _hover={{ textDecoration: 'underline' }}
          onClick={() => setPageType('login')}
        >
          去登录
        </Box>
        <Button
          type="submit"
          mt={8}
          w={'100%'}
          size={mediaLgMd}
          colorScheme="blue"
          isLoading={requesting}
        >
          找回密码
        </Button>
      </form>
    </>
  );
};

export default RegisterForm;
