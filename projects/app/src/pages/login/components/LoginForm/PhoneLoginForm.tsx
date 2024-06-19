import React, { useState, Dispatch, useCallback } from 'react';
import {
  FormControl,
  Flex,
  Input,
  Button,
  Box,
  Link,
  InputGroup,
  InputLeftAddon,
  InputRightAddon,
  Checkbox
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/constants/user';
import { postLogin } from '@/web/support/user/api';
import type { ResLogin } from '@/global/support/api/userRes';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getDocPath } from '@/web/common/system/doc';
import { useTranslation } from 'next-i18next';
import FormLayout from './components/FormLayout';

interface Props {
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  loginSuccess: (e: ResLogin) => void;
}

interface LoginFormType {
  phoneNumber: string;
  captcha: string;
  jobNum: string;
}

const PhoneLoginForm = ({ setPageType, loginSuccess }: Props) => {
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
    async ({ phoneNumber, captcha, jobNum }: LoginFormType) => {
      setRequesting(true);
      try {
        // note: 新的登录接口
        // loginSuccess(
        // await postLogin({
        //   phoneNumber,
        //   captcha
        // })
        // );
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

  return (
    <FormLayout setPageType={setPageType} pageType={LoginPageTypeEnum.passwordLogin}>
      <Box
        mt={['4,53vw', '34px']}
        px={['5vw', '88px']}
        onKeyDown={(e) => {
          if (e.keyCode === 13 && !e.shiftKey && !requesting) {
            handleSubmit(onclickLogin)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.phoneNumber} position={'relative'}>
          <Box
            w={['16vw', '120px']}
            position={'absolute'}
            left={0}
            top={'50%'}
            transform={'translateY(-50%)'}
            zIndex={2}
            textAlign={'center'}
            borderRight={'1px solid #E3E3E3'}
          >
            手机号
          </Box>
          <Input
            pl={['18vw', '140px']}
            borderRadius={'3xl'}
            bg={'myGray.50'}
            placeholder={'请输入' + t('support.user.login.Phone number')}
            {...register('phoneNumber', {
              required: true
            })}
          ></Input>
          <Button
            h={'100%'}
            position={'absolute'}
            right={0}
            top={0}
            bottom={0}
            borderRadius={'3xl'}
            zIndex={2}
          >
            获取验证码
          </Button>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.captcha} position={'relative'}>
          <Box
            w={['16vw', '120px']}
            position={'absolute'}
            left={0}
            top={'50%'}
            transform={'translateY(-50%)'}
            zIndex={2}
            textAlign={'center'}
            borderRight={'1px solid #E3E3E3'}
          >
            验证码
          </Box>
          <Input
            pl={['18vw', '140px']}
            borderRadius={'3xl'}
            bg={'myGray.50'}
            placeholder={'请输入'}
            {...register('captcha', {
              required: true,
              minLength: {
                value: 6,
                message: '请输入6位验证码'
              },
              maxLength: {
                value: 6,
                message: '请输入6位验证码'
              }
            })}
          ></Input>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.captcha} position={'relative'}>
          <Box
            w={['16vw', '120px']}
            position={'absolute'}
            left={0}
            top={'50%'}
            transform={'translateY(-50%)'}
            zIndex={2}
            textAlign={'center'}
            borderRight={'1px solid #E3E3E3'}
          >
            工 号
          </Box>
          <Input
            pl={['18vw', '140px']}
            borderRadius={'3xl'}
            bg={'myGray.50'}
            placeholder={'请输入'}
            {...register('jobNum', {
              required: true,
              maxLength: {
                value: 60,
                message: '密码最多 60 位'
              }
            })}
          ></Input>
        </FormControl>

        <Flex alignItems={'center'} mt={7} fontSize={'sm'}>
          <Checkbox mr={2}></Checkbox>
          {t('support.user.login.Agree Policy')}
          <Link
            ml={1}
            href={getDocPath('/docs/agreement/terms/')}
            target={'_blank'}
            color={'primary.500'}
          >
            {t('support.user.login.Terms')}
          </Link>
          <Box mx={1}>{t('support.user.login.And')}</Box>
          <Link
            href={getDocPath('/docs/agreement/privacy/')}
            target={'_blank'}
            color={'primary.500'}
          >
            {t('support.user.login.Privacy')}
          </Link>
        </Flex>

        <Button
          type="submit"
          mt={['17.87vw', 6]}
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
                {t('support.user.login.Forget Password')}
              </Box>
              <Box mx={3} h={'16px'} w={'1.5px'} bg={'myGray.250'}></Box>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('register')}
                fontSize="sm"
              >
                {t('support.user.login.Register')}
              </Box>
            </Flex>
          </>
        )}
      </Box>
    </FormLayout>
  );
};

export default PhoneLoginForm;
