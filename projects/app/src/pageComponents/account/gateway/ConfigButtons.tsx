import React from 'react';
import { Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import ShareGateModal from './ShareModol';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getMyAppsGate, postCreateApp, putAppById } from '@/web/core/app/api';
import { emptyTemplates } from '@/web/core/app/templates';
import { saveGateConfig } from './HomeTable';
import type { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';
import type { putUpdateGateConfigCopyRightData } from '@fastgpt/global/support/user/team/gate/api';
import { saveCopyRightConfig } from './CopyrightTable';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { form2AppWorkflow } from '@/web/core/app/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';

type Props = {
  tab: 'home' | 'copyright' | 'app' | 'logs';
  appForm?: AppSimpleEditFormType;
  gateConfig?: GateSchemaType;
  copyRightConfig?: putUpdateGateConfigCopyRightData;
};

const ConfigButtons = ({ tab, appForm, gateConfig, copyRightConfig }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();

  // 保存配置
  const { runAsync: saveHomeConfig, loading: savingHome } = useRequest2(
    async () => {
      if (!!gateConfig) {
        await saveGateConfig({
          ...gateConfig,
          status: true
        });
        toast({
          title: t('common:save_success'),
          status: 'success'
        });
      }
    },
    {
      manual: true,
      onError: (err) => {
        toast({
          title: t('common:save_failed'),
          status: 'error',
          description: err?.message
        });
      }
    }
  );
  console.log('buttons appForm', appForm);
  const { nodes, edges } = appForm
    ? form2AppWorkflow(appForm, t)
    : {
        nodes: emptyTemplates[AppTypeEnum.gate].nodes,
        edges: emptyTemplates[AppTypeEnum.gate].edges
      };

  // 保存版权配置
  const { runAsync: saveCopyrightConfig, loading: savingCopyright } = useRequest2(
    async () => {
      // 保存其他版权配置
      if (!!copyRightConfig) {
        await saveCopyRightConfig(copyRightConfig);
        toast({
          title: t('common:save_success'),
          status: 'success'
        });
      }
    },
    {
      manual: true,
      onError: (err) => {
        toast({
          title: t('common:save_failed'),
          status: 'error',
          description: err?.message
        });
      }
    }
  );

  const { ttsModelList, sttModelList } = useSystemStore();
  const checkAndCreateGateApp = async () => {
    try {
      // 获取应用列表
      const apps = await getMyAppsGate();
      const gateApp = apps.find((app) => app.type === AppTypeEnum.gate);
      const currentTeamAvatar = copyRightConfig?.logo;
      const currentSlogan = gateConfig?.slogan;
      if (gateApp) {
        if (
          gateApp.avatar !== currentTeamAvatar ||
          gateApp.intro !== currentSlogan ||
          nodes !== emptyTemplates[AppTypeEnum.gate].nodes ||
          edges !== emptyTemplates[AppTypeEnum.gate].edges
        ) {
          await putAppById(gateApp._id, {
            avatar: currentTeamAvatar,
            intro: currentSlogan,
            name: gateConfig?.name,
            nodes,
            edges,
            chatConfig: {
              ttsConfig:
                ttsModelList.length > 0
                  ? {
                      type: 'model',
                      model: ttsModelList[0].model
                    }
                  : undefined,
              whisperConfig: {
                open: sttModelList.length > 0,
                autoSend: false,
                autoTTSResponse: false
              },
              fileSelectConfig: {
                canSelectFile: true,
                customPdfParse: false,
                canSelectImg: true,
                maxFiles: 10
              }
            }
          });
        }
      } else {
        await postCreateApp({
          avatar: gateConfig?.logo,
          name: 'App',
          intro: gateConfig?.slogan,
          type: AppTypeEnum.gate,
          modules: emptyTemplates[AppTypeEnum.gate].nodes,
          edges: emptyTemplates[AppTypeEnum.gate].edges,
          chatConfig: {
            ttsConfig:
              ttsModelList.length > 0
                ? {
                    type: 'model',
                    model: ttsModelList[0].model
                  }
                : undefined,
            whisperConfig: {
              open: sttModelList.length > 0,
              autoSend: false,
              autoTTSResponse: false
            },
            fileSelectConfig: {
              canSelectFile: true,
              customPdfParse: false,
              canSelectImg: true,
              maxFiles: 10
            }
          }
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
      <ShareGateModal gateConfig={gateConfig} isOpen={isOpen} onClose={onClose} />
    </Flex>
  );
};

export default ConfigButtons;
