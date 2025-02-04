import React from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { useUserStore } from '@/web/support/user/useUserStore';
import { putUpdateTeam } from '@/web/support/user/team/api';

const OpenAIAccountModal = ({
  defaultData,
  onClose
}: {
  defaultData?: OpenaiAccountType;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { userInfo, initUserInfo } = useUserStore();
  const { register, handleSubmit } = useForm({
    defaultValues: defaultData
  });

  const { runAsync: onSubmit, loading } = useRequest2(
    async (data: OpenaiAccountType) => {
      if (!userInfo?.team.teamId) return;
      return putUpdateTeam({
        openaiAccount: data
      });
    },
    {
      onSuccess: () => {
        initUserInfo();
        onClose();
      },
      successToast: t('common:common.Update Success'),
      errorToast: t('common:common.Update Failed')
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/openai"
      title={t('account_thirdParty:openai_account_configuration')}
    >
      <ModalBody>
        <Box fontSize={'sm'} color={'myGray.500'}>
          {t('account_thirdParty:open_api_notice')}
        </Box>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 65px'}>API Key:</Box>
          <Input flex={1} {...register('key')}></Input>
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={'0 0 65px'}>BaseUrl:</Box>
          <Input
            flex={1}
            {...register('baseUrl')}
            placeholder={t('account_thirdParty:request_address_notice')}
          />
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button isLoading={loading} onClick={handleSubmit(onSubmit)}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default OpenAIAccountModal;
