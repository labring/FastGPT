import React, { useCallback, useMemo } from 'react';
import { Box, Flex, HStack, useDisclosure } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import Avatar from '@/components/Avatar';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useI18n } from '@/web/context/I18n';
import { WorkflowContext } from './context';
import { compareWorkflow, filterSensitiveNodesData } from '@/web/core/workflow/utils';
import dynamic from 'next/dynamic';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { publishStatusStyle } from '../constants';

const ImportSettings = dynamic(() => import('./Flow/ImportSettings'));

const AppCard = ({ showSaveStatus }: { showSaveStatus: boolean }) => {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();

  const { appDetail, appLatestVersion, onOpenInfoEdit, onOpenTeamTagModal, onDelApp, currentTab } =
    useContextSelector(AppContext, (v) => v);
  const { historiesDefaultData, flowData2StoreDataAndCheck, onSaveWorkflow, isSaving, saveLabel } =
    useContextSelector(WorkflowContext, (v) => v);

  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const onExportWorkflow = useCallback(async () => {
    const data = flowData2StoreDataAndCheck();
    if (data) {
      copyData(
        JSON.stringify(
          {
            nodes: filterSensitiveNodesData(data.nodes),
            edges: data.edges,
            chatConfig: appDetail.chatConfig
          },
          null,
          2
        ),
        appT('Export Config Successful')
      );
    }
  }, [appDetail.chatConfig, appT, copyData, flowData2StoreDataAndCheck]);

  const isPublished = (() => {
    const data = flowData2StoreDataAndCheck(true);
    if (!appLatestVersion) return true;

    if (data) {
      return compareWorkflow(
        {
          nodes: appLatestVersion.nodes,
          edges: appLatestVersion.edges,
          chatConfig: appLatestVersion.chatConfig
        },
        {
          nodes: data.nodes,
          edges: data.edges,
          chatConfig: appDetail.chatConfig
        }
      );
    }
    return false;
  })();

  const InfoMenu = useCallback(
    ({ children }: { children: React.ReactNode }) => {
      return (
        <MyMenu
          width={150}
          Button={children}
          menuList={[
            {
              children: [
                {
                  icon: 'edit',
                  label: appT('Edit info'),
                  onClick: onOpenInfoEdit
                },
                {
                  icon: 'support/team/key',
                  label: t('common.Role'),
                  onClick: onOpenInfoEdit
                }
              ]
            },
            ...(!historiesDefaultData && currentTab === TabEnum.appEdit
              ? [
                  {
                    children: [
                      {
                        label: appT('Import Configs'),
                        icon: 'common/importLight',
                        onClick: onOpenImport
                      },
                      {
                        label: appT('Export Configs'),
                        icon: 'export',
                        onClick: onExportWorkflow
                      }
                    ]
                  }
                ]
              : []),
            ...(appDetail.permission.hasWritePer && feConfigs?.show_team_chat
              ? [
                  {
                    children: [
                      {
                        icon: 'support/team/memberLight',
                        label: t('common.Team Tags Set'),
                        onClick: onOpenTeamTagModal
                      }
                    ]
                  }
                ]
              : []),
            ...(appDetail.permission.isOwner
              ? [
                  {
                    children: [
                      {
                        type: 'danger' as 'danger',
                        icon: 'delete',
                        label: t('common.Delete'),
                        onClick: onDelApp
                      }
                    ]
                  }
                ]
              : [])
          ]}
        />
      );
    },
    [
      appDetail.permission.hasWritePer,
      appDetail.permission.isOwner,
      appT,
      currentTab,
      feConfigs?.show_team_chat,
      historiesDefaultData,
      onDelApp,
      onExportWorkflow,
      onOpenImport,
      onOpenInfoEdit,
      onOpenTeamTagModal,
      t
    ]
  );

  const Render = useMemo(() => {
    return (
      <HStack>
        <InfoMenu>
          <Avatar src={appDetail.avatar} w={'1.75rem'} />
        </InfoMenu>
        <Box>
          <InfoMenu>
            <HStack spacing={1} cursor={'pointer'}>
              <Box color={'myGray.900'}>{appDetail.name}</Box>
              <MyIcon name={'common/select'} w={'1rem'} />
            </HStack>
          </InfoMenu>
          {showSaveStatus && (
            <MyTooltip label={t('core.app.Onclick to save')}>
              <Flex
                alignItems={'center'}
                h={'20px'}
                cursor={'pointer'}
                fontSize={'mini'}
                onClick={onSaveWorkflow}
                lineHeight={1}
              >
                {isSaving && <MyIcon name={'common/loading'} w={'0.8rem'} mr={0.5} />}
                <Box color={'myGray.500'}>{saveLabel}</Box>
                <MyTag
                  py={0}
                  showDot
                  bg={'transparent'}
                  colorSchema={
                    isPublished
                      ? publishStatusStyle.published.colorSchema
                      : publishStatusStyle.unPublish.colorSchema
                  }
                >
                  {isPublished
                    ? publishStatusStyle.published.text
                    : publishStatusStyle.unPublish.text}
                </MyTag>
              </Flex>
            </MyTooltip>
          )}
        </Box>

        {isOpenImport && <ImportSettings onClose={onCloseImport} />}
      </HStack>
    );
  }, [
    InfoMenu,
    appDetail.avatar,
    appDetail.name,
    isOpenImport,
    isPublished,
    isSaving,
    onCloseImport,
    onSaveWorkflow,
    saveLabel,
    showSaveStatus,
    t
  ]);

  return Render;
};

export default AppCard;
