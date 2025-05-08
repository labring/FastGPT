import React from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button, HStack } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { resetPassword, getCheckPswExpired } from '@/web/support/user/api';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import Icon from '@fastgpt/web/components/common/Icon';

type FormType = {
  newPsw: string;
  confirmPsw: string;
};

const ResetPswModal = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { userInfo } = useUserStore();

  const { register, handleSubmit, getValues } = useForm<FormType>({
    defaultValues: {
      newPsw: '',
      confirmPsw: ''
    }
  });

  const {
    data: passwordExpired = false,
    runAsync,
    loading: isFetching
  } = useRequest2(
    async () => {
      if (!userInfo?._id) {
        return false;
      }
      return getCheckPswExpired();
    },
    {
      manual: false,
      refreshDeps: [userInfo?._id]
    }
  );

  const { runAsync: onSubmit, loading: isSubmitting } = useRequest2(resetPassword, {
    onSuccess() {
      runAsync();
    },
    successToast: t('common:user.Update password successful'),
    errorToast: t('common:user.Update password failed')
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

  return passwordExpired ? (
    <MyModal isOpen iconSrc="/imgs/modal/password.svg" title={t('common:user.reset_password')}>
      <ModalBody>
        <HStack p="3" color="primary.600" bgColor="primary.50" borderRadius="md">
          <Icon name="common/info" w="1rem" />
          <Box fontSize={'xs'}>{t('common:user.reset_password_tip')}</Box>
        </HStack>
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
        <Button
          isLoading={isSubmitting || isFetching}
          onClick={handleSubmit((data) => onSubmit(data.newPsw), onSubmitErr)}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  ) : null;
};

export default React.memo(ResetPswModal);
