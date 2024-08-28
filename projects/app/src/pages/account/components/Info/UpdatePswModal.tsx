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
        return Promise.reject(t('common:common.Password inconsistency'));
      }
      return updatePasswordByOld(data);
    },
    onSuccess() {
      onClose();
    },
    successToast: t('common:user.Update password successful'),
    errorToast: t('common:user.Update password failed')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/password.svg"
      title={t('common:user.Update Password')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 70px'}>{t('common:user.old_password') + ':'}</Box>
          <Input flex={1} type={'password'} {...register('oldPsw', { required: true })}></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'}>{t('common:user.new_password') + ':'}</Box>
          <Input
            flex={1}
            type={'password'}
            {...register('newPsw', {
              required: true,
              maxLength: {
                value: 60,
                message: t('common:user.password_message')
              }
            })}
          ></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'}>{t('common:user.confirm_password') + ':'}</Box>
          <Input
            flex={1}
            type={'password'}
            {...register('confirmPsw', {
              required: true,
              maxLength: {
                value: 60,
                message: t('common:user.password_message')
              }
            })}
          ></Input>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default UpdatePswModal;
