import React from 'react';
import { Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import ShareGateModal from './ShareModol';
import { GateTool } from '@fastgpt/global/support/user/team/gate/type';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getMyApps, postCreateApp, putAppById } from '@/web/core/app/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { emptyTemplates } from '@/web/core/app/templates';
import { putUpdateTeam } from '@/web/support/user/team/api';

type Props = {
  tab: 'home' | 'copyright';
  tools: GateTool[];
  slogan: string;
  placeholderText: string;
  status: boolean;
  teamName: string;
};

const ConfigButtons = ({ tab }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { saveGateConfig, saveCopyRightConfig, copyRightConfig } = useGateStore();
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
      const apps = await getMyApps();
      const gateApp = apps.find((app) => app.name === 'gate');
      const currentTeamAvatar = copyRightConfig?.avatar || userInfo?.team?.teamAvatar;

      if (gateApp) {
        if (gateApp.avatar !== currentTeamAvatar) {
          await putAppById(gateApp._id, {
            avatar: currentTeamAvatar
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
          type: AppTypeEnum.simple,
          modules: emptyTemplates[AppTypeEnum.simple].nodes,
          edges: emptyTemplates[AppTypeEnum.simple].edges,
          chatConfig: {
            fileSelectConfig: {
              canSelectFile: true,
              canSelectImg: true,
              maxFiles: 10
            }
          }
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
