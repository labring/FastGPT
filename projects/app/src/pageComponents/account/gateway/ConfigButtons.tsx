import React from 'react';
import { Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import ShareGateModal from './ShareModol';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getMyAppsGate, postCreateApp, putAppById } from '@/web/core/app/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { emptyTemplates } from '@/web/core/app/templates';
import { putUpdateTeam } from '@/web/support/user/team/api';

type Props = {
  tab: 'home' | 'copyright';
  tools: string[];
  slogan: string;
  placeholderText: string;
  status: boolean;
  teamName: string;
};

const ConfigButtons = ({ tab }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { saveGateConfig, saveCopyRightConfig, copyRightConfig, gateConfig } = useGateStore();
  const { userInfo } = useUserStore();

  // 保存配置
  const { runAsync: saveHomeConfig, loading: savingHome } = useRequest2(
    async () => {
      await saveGateConfig();
      toast({
        title: t('common:common.Save Success'),
        status: 'success'
      });
    },
    {
      manual: true,
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
      const currentTeamAvatar = userInfo?.team?.teamAvatar;
      // 如果有头像，先使用putUpdateTeam API更新团队头像
      if (copyRightConfig?.avatar && copyRightConfig?.avatar !== currentTeamAvatar) {
        await putUpdateTeam({
          avatar: copyRightConfig.avatar
        });
      }

      // 保存其他版权配置
      await saveCopyRightConfig();
      toast({
        title: t('common:common.Save Success'),
        status: 'success'
      });
    },
    {
      manual: true,
      onError: (err) => {
        toast({
          title: t('common:common.Save Failed'),
          status: 'error',
          description: err?.message
        });
      }
    }
  );
  const checkAndCreateGateApp = async () => {
    try {
      // 获取应用列表
      const apps = await getMyAppsGate();
      const gateApp = apps.find((app) => app.type === AppTypeEnum.gate);
      const currentTeamAvatar = copyRightConfig?.avatar || userInfo?.team?.teamAvatar;
      const currentSlogan = gateConfig?.slogan;

      if (gateApp) {
        if (gateApp.avatar !== currentTeamAvatar || gateApp.intro !== currentSlogan) {
          await putAppById(gateApp._id, {
            avatar: currentTeamAvatar,
            intro: currentSlogan
          });
          toast({
            title: t('common:common.Update Success'),
            status: 'success'
          });
        }
      } else {
        await postCreateApp({
          avatar: currentTeamAvatar,
          name: 'gate',
          intro: gateConfig?.slogan,
          type: AppTypeEnum.gate,
          modules: emptyTemplates[AppTypeEnum.gate].nodes,
          edges: emptyTemplates[AppTypeEnum.gate].edges,
          chatConfig: emptyTemplates[AppTypeEnum.gate].chatConfig
        });
        toast({
          title: t('common:common.Create Success'),
          status: 'success'
        });
      }
    } catch (error) {
      toast({
        title: t('common:error.Create failed'),
        status: 'error'
      });
    }
  };
  const handleSave = async () => {
    if (tab === 'home') {
      await saveHomeConfig();
      await checkAndCreateGateApp();
    } else if (tab === 'copyright') {
      await saveCopyrightConfig();
      await checkAndCreateGateApp();
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
