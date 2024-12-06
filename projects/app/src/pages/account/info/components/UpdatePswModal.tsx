import React from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { updatePasswordByOld } from '@/web/support/user/api';

type FormType = {
  oldPsw: string;
  newPsw: string;
  confirmPsw: string;
};

const UpdatePswModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm<FormType>({
    defaultValues: {
      oldPsw: '',
      newPsw: '',
      confirmPsw: ''
    }
  });

  const { mutate: onSubmit, isLoading } = useRequest({
    mutationFn: (data: FormType) => {
      if (data.newPsw !== data.confirmPsw) {
        return Promise.reject(t('account_info:password_mismatch'));
      }
      return updatePasswordByOld(data);
    },
    onSuccess() {
      onClose();
    },
    successToast: t('account_info:password_update_success'),
    errorToast: t('account_info:password_update_error')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/password.svg"
      title={t('account_info:update_password')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 70px'}>{t('account_info:old_password') + ':'}</Box>
          <Input flex={1} type={'password'} {...register('oldPsw', { required: true })}></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'}>{t('account_info:new_password') + ':'}</Box>
          <Input
            flex={1}
            type={'password'}
            {...register('newPsw', {
              required: true,
              maxLength: {
                value: 60,
                message: t('account_info:password_length_error')
              }
            })}
          ></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'}>{t('account_info:confirm_password') + ':'}</Box>
          <Input
            flex={1}
            type={'password'}
            {...register('confirmPsw', {
              required: true,
              maxLength: {
                value: 60,
                message: t('account_info:password_length_error')
              }
            })}
          ></Input>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('account_info:cancel')}
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          {t('account_info:confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default UpdatePswModal;
