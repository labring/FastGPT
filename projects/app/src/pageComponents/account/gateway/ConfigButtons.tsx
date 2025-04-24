import React from 'react';
import { Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import ShareGateModal from './ShareModol';
import {
  updateTeamGateConfig,
  updateTeamGateConfigCopyRight
} from '@/web/support/user/team/gate/api';
import { GateTool } from '@fastgpt/global/support/user/team/gate/type';

type Props = {
  tab: 'home' | 'copyright';
  tools: GateTool[];
  slogan: string;
  placeholderText: string;
  status: boolean;
  teamName: string;
};

const ConfigButtons = ({ tab, tools, slogan, placeholderText, status, teamName }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  // 保存配置
  const { runAsync: saveHomeConfig, loading: savingHome } = useRequest2(
    async () => {
      await updateTeamGateConfig({
        tools,
        slogan,
        placeholderText,
        status
      });
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

  // 保存版权配置
  const { runAsync: saveCopyrightConfig, loading: savingCopyright } = useRequest2(
    async () => {
      await updateTeamGateConfigCopyRight({
        name: teamName
      });
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

  const handleSave = () => {
    if (tab === 'home') {
      saveHomeConfig();
    } else if (tab === 'copyright') {
      saveCopyrightConfig();
    }
  };

  return (
    <Flex>
      <Button
        variant="primaryOutline"
        mr={2}
        leftIcon={<MyIcon name="support/gate/home/savePrimary" />}
        onClick={handleSave}
        isLoading={tab === 'home' ? savingHome : savingCopyright}
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
