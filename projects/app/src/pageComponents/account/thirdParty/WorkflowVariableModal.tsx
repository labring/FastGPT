import { Box, Button, Flex, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import { type ThirdPartyAccountType } from '../../../pages/account/thirdParty/index';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useUserStore } from '@/web/support/user/useUserStore';
import { putUpdateTeam } from '@/web/support/user/team/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const WorkflowVariableModal = ({
  defaultData,
  onClose
}: {
  defaultData: ThirdPartyAccountType;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { userInfo, initUserInfo } = useUserStore();

  const { register, handleSubmit } = useForm({
    defaultValues: {
      value: '',
      key: defaultData.key || ''
    }
  });

  const { runAsync: onSubmit, loading } = useRequest2(
    async (data: { key: string; value: string }) => {
      if (!userInfo?.team.teamId) return;

      await putUpdateTeam({
        externalWorkflowVariable: data
      });
    },
    {
      onSuccess: () => {
        initUserInfo();
        onClose();
      },
      successToast: t('common:update_success'),
      errorToast: t('common:update_failed')
    }
  );

  return (
    <MyModal title={`${defaultData.name} 配置`} iconSrc={'edit'} iconColor={'primary.600'}>
      <ModalBody w={'420px'}>
        <Box fontSize={'14px'} color={'myGray.900'}>
          {defaultData.intro}
        </Box>
        <Box h={'1px'} bg={'myGray.150'} my={4}></Box>
        <Flex alignItems={'center'}>
          <Box fontSize={'14px'} color={'myGray.900'} fontWeight={'medium'}>
            {t('common:value')}
          </Box>
          <Input
            ml={8}
            bg={'myGray.50'}
            placeholder={t('account_thirdParty:value_placeholder')}
            flex={1}
            {...register('value')}
          />
        </Flex>
        <Box mt={1} color={'myGray.500'} fontSize={'xs'}>
          {t('account_thirdParty:value_not_return_tip')}
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={loading} onClick={handleSubmit(onSubmit)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(WorkflowVariableModal);
