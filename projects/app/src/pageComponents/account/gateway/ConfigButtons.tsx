import React from 'react';
import { Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { createTeamGateConfig } from '@/web/support/user/team/gate/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import ShareGateModal from './ShareModol';

const ConfigButtons = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const teamId = userInfo?.team?.teamId || '';
  const { isOpen, onOpen, onClose } = useDisclosure();

  // 保存配置
  const { runAsync: saveConfig, loading: saving } = useRequest2(
    async () => {
      if (!teamId) return;
      return await createTeamGateConfig({ teamId });
    },
    {
      manual: true,
      onSuccess: () => {
        toast({
          title: t('common:common.Save Success'),
          status: 'success'
        });
      },
      onError: (err) => {
        toast({
          title: t('common:common.Save Failed'),
          status: 'error',
          description: err?.message
        });
      }
    }
  );

  return (
    <Flex>
      <Button
        variant="primaryOutline"
        mr={2}
        leftIcon={<MyIcon name="support/gate/home/savePrimary" />}
        onClick={() => saveConfig()}
        isLoading={saving}
      >
        {t('account:gateway.save_config')}
      </Button>
      <Button
        variant={'primary'}
        mr={2}
        leftIcon={<MyIcon name="support/gate/home/shareLight" />}
        onClick={onOpen}
      >
        {t('account:gateway.share')}
      </Button>

      {/* 分享门户弹窗 */}
      <ShareGateModal isOpen={isOpen} onClose={onClose} />
    </Flex>
  );
};

export default ConfigButtons;
