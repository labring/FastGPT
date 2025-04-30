import React from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { resetPassword } from '@/web/support/user/api';
import { checkPasswordRule } from '@/web/support/user/login/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';

type FormType = {
  userId: string;
  newPsw: string;
  confirmPsw: string;
};

const ResetPswModal = ({ onClose }: { onClose: () => void }) => {
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

  React.useEffect(() => {
    if (userInfo?._id) {
      setValue('userId', userInfo._id);
    }
  }, [userInfo, setValue]);

  const { runAsync: onSubmit, loading: isLoading } = useRequest2(
    async (data: { userId: string; newPsw: string }) => {
      if (!data.userId && userInfo?._id) {
        data.userId = userInfo._id;
      }
      console.log('data', data);
      await resetPassword(data);
    },
    {
      onSuccess() {
        onClose();
      },
      successToast: t('account_info:password_update_success'),
      errorToast: t('account_info:password_update_error')
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

  return (
    <MyModal isOpen iconSrc="/imgs/modal/password.svg" title={t('common:user.reset_password')}>
      <ModalBody>
        <Flex alignItems={'center'} color={'primary.600'} fontSize={'sm'}>
          {t('common:user.reset_password_tip')}
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
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ResetPswModal;
