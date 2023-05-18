import React, { useState, Dispatch, useCallback } from 'react';
import { FormControl, Box, Input, Button, FormErrorMessage, Flex } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { PageTypeEnum } from '@/constants/user';
import { postRegister } from '@/api/user';
import { useSendCode } from '@/hooks/useSendCode';
import type { ResLogin } from '@/api/response/user';
import { useToast } from '@/hooks/useToast';
import { useRouter } from 'next/router';
import { postCreateModel } from '@/api/model';

interface Props {
  loginSuccess: (e: ResLogin) => void;
  setPageType: Dispatch<`${PageTypeEnum}`>;
}

interface RegisterType {
  username: string;
  password: string;
  password2: string;
  code: string;
}

const RegisterForm = ({ setPageType, loginSuccess }: Props) => {
  const { inviterId = '' } = useRouter().query as { inviterId: string };
  const { toast } = useToast();
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
      type: 'register'
    });
  }, [getValues, sendCode, trigger]);

  const [requesting, setRequesting] = useState(false);

  const onclickRegister = useCallback(
    async ({ username, password, code }: RegisterType) => {
      setRequesting(true);
      try {
        loginSuccess(
          await postRegister({
            username,
            code,
            password,
            inviterId: inviterId || localStorage.getItem('inviterId') || ''
          })
        );
        toast({
          title: `注册成功`,
          status: 'success'
        });
        // aut register a model
        postCreateModel({
          name: 'AI助手1'
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
        <FormControl mt={5} isInvalid={!!errors.username}>
          <Input
            placeholder="邮箱/手机号"
            size={['md', 'lg']}
            {...register('username', {
              required: '邮箱/手机号不能为空',
              pattern: {
                value:
                  /(^1[3456789]\d{9}$)|(^[A-Za-z0-9]+([_\.][A-Za-z0-9]+)*@([A-Za-z0-9\-]+\.)+[A-Za-z]{2,6}$)/,
                message: '邮箱/手机号格式错误'
              }
            })}
          ></Input>
          <FormErrorMessage position={'absolute'} fontSize="xs">
            {!!errors.username && errors.username.message}
          </FormErrorMessage>
        </FormControl>
        <FormControl mt={8} isInvalid={!!errors.username}>
          <Flex>
            <Input
              flex={1}
              size={['md', 'lg']}
              placeholder="验证码"
              {...register('code', {
                required: '验证码不能为空'
              })}
            ></Input>
            <Button
              ml={5}
              w={'145px'}
              maxW={'50%'}
              size={['md', 'lg']}
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
            size={['md', 'lg']}
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
            size={['md', 'lg']}
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
          color={'myBlue.600'}
          cursor={'pointer'}
          _hover={{ textDecoration: 'underline' }}
          onClick={() => setPageType('login')}
        >
          已有账号，去登录
        </Box>
        <Button
          type="submit"
          mt={5}
          w={'100%'}
          size={['md', 'lg']}
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
