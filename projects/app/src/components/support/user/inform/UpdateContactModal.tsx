import React from 'react';
import { Box, Button, Flex, IconButton, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { updateContact, updateNotificationAccount } from '@/web/support/user/api';
import Icon from '@fastgpt/web/components/common/Icon';
import { useSendCode } from '@/web/support/user/hooks/useSendCode';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { VerificationCodeTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';

type FormType = {
  contact: string;
  verifyCode: string;
};

const UpdateContactModal = ({
  onClose,
  onSuccess,
  mode
}: {
  onClose: () => void;
  onSuccess?: (val: string) => void;
  mode: 'contact' | 'notification_account';
}) => {
  const { t } = useTranslation();
  const { initUserInfo } = useUserStore();
  const { feConfigs } = useSystemStore();

  const { register, handleSubmit, watch } = useForm<FormType>({
    defaultValues: {
      contact: '',
      verifyCode: ''
    }
  });

  const account = watch('contact');
  const verifyCode = watch('verifyCode');

  const { runAsync: onSubmit, loading: isLoading } = useRequest(
    async (data: FormType) => {
      if (mode === 'contact') {
        await updateContact(data);
      } else {
        await updateNotificationAccount({
          account: data.contact,
          verifyCode: data.verifyCode
        });
      }
      return data.contact;
    },
    {
      onSuccess(data) {
        initUserInfo();
        onClose();
        onSuccess?.(data);
      },
      successToast: t('common:support.user.info.bind_notification_success'),
      errorToast: t('common:support.user.info.bind_notification_error')
    }
  );

  const { SendCodeBox } = useSendCode({
    type: VerificationCodeTypeEnum.bindNotification,
    purpose: 'bindNotification'
  });

  const placeholder = feConfigs?.bind_notification_method
    ?.map((item) => {
      switch (item) {
        case 'email':
          return t('common:support.user.login.Email');
        case 'phone':
          return t('common:support.user.login.Phone number');
      }
    })
    .join('/');

  return (
    <MyModal
      isOpen
      isCentered
      onClose={onClose}
      showCloseButton={false}
      title={
        mode === 'notification_account'
          ? t('common:support.user.info.notification_receiving_hint')
          : t('common:contact_way')
      }
      borderRadius="10px"
      bodyStyles={{ pt: 0 }}
      footer={
        <>
          <Button
            variant="whiteBase"
            h="32px"
            minH="32px"
            px="14px"
            fontSize="12px"
            lineHeight="16px"
            letterSpacing="0.5px"
            borderRadius="6px"
            onClick={onClose}
          >
            {t('common:Cancel')}
          </Button>
          <Button
            variant="primary"
            h="32px"
            minH="32px"
            px="14px"
            fontSize="12px"
            lineHeight="16px"
            letterSpacing="0.5px"
            borderRadius="6px"
            isLoading={isLoading}
            isDisabled={!account || !verifyCode}
            _disabled={{
              bg: 'primary.3 !important',
              color: 'white !important',
              opacity: 1
            }}
            onClick={handleSubmit((data) => onSubmit(data))}
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <IconButton
        aria-label={t('common:Close')}
        icon={<Icon name="close" w="20px" h="20px" />}
        variant="ghost"
        position="absolute"
        top="8px"
        right="8px"
        w="36px"
        h="36px"
        minW="36px"
        p="4px"
        borderRadius="4px"
        zIndex={1}
        onClick={onClose}
      />
      <Box mt="8px" color="#667085" fontSize="12px" lineHeight="16px" letterSpacing="0.048px">
        {t('common:support.user.info.bind_notification_hint')}
      </Box>
      <Flex direction="column" gap="16px" mt="24px">
        <Flex direction="column" gap="8px">
          <Box
            color="#24282C"
            fontSize="12px"
            fontWeight={500}
            lineHeight="16px"
            letterSpacing="0.5px"
          >
            {mode === 'notification_account' ? t('common:user.Account') : t('common:contact_way')}
          </Box>
          <Input
            size="sm"
            px="12px"
            fontSize="12px"
            lineHeight="16px"
            letterSpacing="0.048px"
            borderColor="#E8EBF0"
            borderRadius="6px"
            bg="white"
            _placeholder={{ color: '#667085', fontSize: '12px' }}
            {...register('contact', { required: true })}
            placeholder={placeholder}
          />
        </Flex>
        <Flex direction="column" gap="8px" position="relative">
          <Box
            color="#24282C"
            fontSize="12px"
            fontWeight={500}
            lineHeight="16px"
            letterSpacing="0.5px"
          >
            {t('common:support.user.info.verification_code')}
          </Box>
          <Input
            size="sm"
            px="12px"
            pr="84px"
            fontSize="12px"
            lineHeight="16px"
            letterSpacing="0.048px"
            borderColor="#E8EBF0"
            borderRadius="6px"
            bg="white"
            _placeholder={{ color: '#667085', fontSize: '12px' }}
            {...register('verifyCode', { required: true })}
            placeholder={t('common:support.user.info.code_required')}
          />
          <SendCodeBox
            username={account}
            top="40px"
            transform="translateY(-50%)"
            lineHeight="18px"
          />
        </Flex>
      </Flex>
    </MyModal>
  );
};

export default UpdateContactModal;
