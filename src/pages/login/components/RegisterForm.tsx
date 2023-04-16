import React, { useState, Dispatch, useCallback } from 'react';
import { FormControl, Box, Input, Button, FormErrorMessage, Flex } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { PageTypeEnum } from '@/constants/user';
import { postRegister } from '@/api/user';
import { useSendCode } from '@/hooks/useSendCode';
import type { ResLogin } from '@/api/response/user';
import { useScreen } from '@/hooks/useScreen';
import { useToast } from '@/hooks/useToast';
import { useRouter } from 'next/router';

interface Props {
  loginSuccess: (e: ResLogin) => void;
  setPageType: Dispatch<`${PageTypeEnum}`>;
}

interface RegisterType {
  phone: string;
  password: string;
  password2: string;
  code: string;
}

const RegisterForm = ({ setPageType, loginSuccess }: Props) => {
  const { inviterId = '' } = useRouter().query as { inviterId: string };
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
    const check = await trigger('phone');
    if (!check) return;
    sendCode({
      username: getValues('phone'),
      type: 'register'
    });
  }, [getValues, sendCode, trigger]);

  const [requesting, setRequesting] = useState(false);

  const onclickRegister = useCallback(
    async ({ phone, password, code }: RegisterType) => {
      setRequesting(true);
      try {
        loginSuccess(
          await postRegister({
            phone,
            code,
            password,
            inviterId
          })
        );
        toast({
          title: `注册成功`,
          status: 'success'
        });
      } catch (error: any) {
        toast({
          title: error.message || '注册异常',
          status: 'error'
        });
      }
      setRequesting(false);
    },
    [inviterId, loginSuccess, toast]
  );

  return (
    <>
      <Box fontWeight={'bold'} fontSize={'2xl'} textAlign={'center'}>
        注册 FastGPT 账号
      </Box>
      <form onSubmit={handleSubmit(onclickRegister)}>
        <FormControl mt={8} isInvalid={!!errors.phone}>
          <Input
            placeholder="手机号"
            size={mediaLgMd}
            {...register('phone', {
              required: '手机号不能为空',
              pattern: {
                value: /^1[3456789]\d{9}$/,
                message: '手机号格式错误'
              }
            })}
          ></Input>
          <FormErrorMessage position={'absolute'} fontSize="xs">
            {!!errors.phone && errors.phone.message}
          </FormErrorMessage>
        </FormControl>
        <FormControl mt={8} isInvalid={!!errors.phone}>
          <Flex>
            <Input
              flex={1}
              size={mediaLgMd}
              placeholder="验证码"
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
            placeholder="密码"
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
          已有账号，去登录
        </Box>
        <Button
          type="submit"
          mt={8}
          w={'100%'}
          size={mediaLgMd}
          colorScheme="blue"
          isLoading={requesting}
        >
          确认注册
        </Button>
      </form>
    </>
  );
};

export default RegisterForm;
