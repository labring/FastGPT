import React from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { updatePasswordByOld } from '@/web/support/user/api';
import { PasswordRule } from '@/web/support/user/login/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';

type FormType = {
  oldPsw: string;
  newPsw: string;
  confirmPsw: string;
};

const UpdatePswModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { register, handleSubmit, getValues } = useForm<FormType>({
    defaultValues: {
      oldPsw: '',
      newPsw: '',
      confirmPsw: ''
    }
  });

  const { runAsync: onSubmit, loading: isLoading } = useRequest2(updatePasswordByOld, {
    onSuccess() {
      onClose();
    },
    successToast: t('account_info:password_update_success'),
    errorToast: t('account_info:password_update_error')
  });
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
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/password.svg"
      title={t('account_info:update_password')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 70px'} fontSize={'sm'}>
            {t('account_info:old_password') + ':'}
          </Box>
          <Input flex={1} type={'password'} {...register('oldPsw', { required: true })}></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'} fontSize={'sm'}>
            {t('account_info:new_password') + ':'}
          </Box>
          <Input
            flex={1}
            type={'password'}
            placeholder={t('account_info:password_tip')}
            {...register('newPsw', {
              required: true,
              pattern: {
                value: PasswordRule,
                message: t('account_info:password_tip')
              }
            })}
          ></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'} fontSize={'sm'}>
            {t('account_info:confirm_password') + ':'}
          </Box>
          <Input
            flex={1}
            type={'password'}
            placeholder={t('user:password.confirm')}
            {...register('confirmPsw', {
              required: true,
              validate: (val) => (getValues('newPsw') === val ? true : t('user:password.not_match'))
            })}
          ></Input>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('account_info:cancel')}
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data), onSubmitErr)}>
          {t('account_info:confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default UpdatePswModal;
