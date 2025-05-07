import React, { useEffect, useState } from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { resetPassword, checkReset } from '@/web/support/user/api';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';

type FormType = {
  userId: string;
  newPsw: string;
  confirmPsw: string;
};

const ResetPswModal = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { userInfo } = useUserStore();

  const { register, handleSubmit, getValues, setValue } = useForm<FormType>({
    defaultValues: {
      userId: '',
      newPsw: '',
      confirmPsw: ''
    }
  });

  const [resetPsw, setResetPassword] = useState(false);

  const { runAsync: check } = useRequest2(async (data: { updateTime: Date }) => {
    const res = await checkReset(data);
    return res;
  });

  useEffect(() => {
    if (userInfo) {
      if (userInfo?.passwordUpdateTime) {
        check({ updateTime: userInfo?.passwordUpdateTime }).then((needReset) => {
          if (needReset) {
            setResetPassword(true);
          }
        });
      } else {
        setResetPassword(true);
      }
    }
  }, [check, userInfo]);

  useEffect(() => {
    if (userInfo?._id) {
      setValue('userId', userInfo._id);
    }
  }, [userInfo, setValue]);

  const { runAsync: onSubmit, loading: isLoading } = useRequest2(
    async (data: { userId: string; newPsw: string }) => {
      if (!data.userId && userInfo?._id) {
        data.userId = userInfo._id;
      }
      await resetPassword(data);
    },
    {
      onSuccess() {
        setResetPassword(false);
      },
      successToast: t('common:user.Update password successful'),
      errorToast: t('common:user.Update password failed')
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

  if (!resetPsw) {
    return;
  }

  return (
    <MyModal isOpen iconSrc="/imgs/modal/password.svg" title={t('common:user.reset_password')}>
      <ModalBody>
        <Flex alignItems={'center'} color={'primary.600'} fontSize={'sm'}>
          {/* { t('common:user.init_password')t('common:user.reset_password_tip')} */}
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'} fontSize={'sm'}>
            {t('common:user.new_password') + ':'}
          </Box>
          <Input
            flex={1}
            type={'password'}
            placeholder={t('common:user.password_tip')}
            {...register('newPsw', {
              required: true,
              validate: (val) => {
                if (!checkPasswordRule(val)) {
                  return t('common:user.password_tip');
                }
                return true;
              }
            })}
          ></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'} fontSize={'sm'}>
            {t('common:user.confirm_password') + ':'}
          </Box>
          <Input
            flex={1}
            type={'password'}
            placeholder={t('common:user.confirm_password')}
            {...register('confirmPsw', {
              required: true,
              validate: (val) => (getValues('newPsw') === val ? true : t('user:password.not_match'))
            })}
          ></Input>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data), onSubmitErr)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ResetPswModal;
