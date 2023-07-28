import React from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useRequest } from '@/hooks/useRequest';
import { updatePasswordByOld } from '@/api/user';

const UpdatePswModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      oldPsw: '',
      newPsw: '',
      confirmPsw: ''
    }
  });

  const { mutate: onSubmit, isLoading } = useRequest({
    mutationFn: (data) => {
      return updatePasswordByOld(data);
    },
    onSuccess() {
      onClose();
    },
    successToast: t('user.Update password succseful'),
    errorToast: t('user.Update password failed')
  });

  return (
    <MyModal isOpen onClose={onClose} title={t('user.Update Password')}>
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 70px'}>旧密码:</Box>
          <Input flex={1} type={'password'} {...register('oldPsw', { required: true })}></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'}>新密码:</Box>
          <Input flex={1} type={'password'} {...register('newPsw', { required: true })}></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 70px'}>确认密码:</Box>
          <Input flex={1} type={'password'} {...register('confirmPsw', { required: true })}></Input>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'base'} onClick={onClose}>
          取消
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default UpdatePswModal;
