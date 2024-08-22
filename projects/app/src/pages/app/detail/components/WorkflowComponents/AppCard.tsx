import React, { useCallback, useMemo } from 'react';
import { Box, Flex, HStack, useDisclosure } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useI18n } from '@/web/context/I18n';
import { WorkflowContext } from './context';
import { filterSensitiveNodesData } from '@/web/core/workflow/utils';
import dynamic from 'next/dynamic';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { publishStatusStyle } from '../constants';

const ImportSettings = dynamic(() => import('./Flow/ImportSettings'));

const AppCard = ({
  showSaveStatus,
  isPublished
}: {
  showSaveStatus: boolean;
  isPublished: boolean;
}) => {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();

  const { appDetail, onOpenInfoEdit, onOpenTeamTagModal, onDelApp, currentTab } =
    useContextSelector(AppContext, (v) => v);
  const { historiesDefaultData, flowData2StoreDataAndCheck, onSaveWorkflow, isSaving } =
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
        appT('export_config_successful')
      );
    }
  }, [appDetail.chatConfig, appT, copyData, flowData2StoreDataAndCheck]);

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
                  label: appT('edit_info'),
                  onClick: onOpenInfoEdit
                },
                {
                  icon: 'support/team/key',
                  label: t('common:common.Role'),
                  onClick: onOpenInfoEdit
                }
              ]
            },
            ...(!historiesDefaultData && currentTab === TabEnum.appEdit
              ? [
                  {
                    children: [
                      {
                        label: appT('import_configs'),
                        icon: 'common/importLight',
                        onClick: onOpenImport
                      },
                      {
                        label: appT('export_configs'),
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
                        label: t('common:common.Team Tags Set'),
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
                        label: t('common:common.Delete'),
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
          <Avatar src={appDetail.avatar} w={'1.75rem'} borderRadius={'md'} />
        </InfoMenu>
        <Box>
          <InfoMenu>
            <HStack spacing={1} cursor={'pointer'}>
              <Box color={'myGray.900'}>{appDetail.name}</Box>
              <MyIcon name={'common/select'} w={'1rem'} />
            </HStack>
          </InfoMenu>
          {showSaveStatus && (
            <Flex alignItems={'center'} h={'20px'} fontSize={'mini'} lineHeight={1}>
              <MyTag
                py={0}
                px={0}
                showDot
                bg={'transparent'}
                colorSchema={
                  isPublished
                    ? publishStatusStyle.published.colorSchema
                    : publishStatusStyle.unPublish.colorSchema
                }
              >
                {t(
                  isPublished
                    ? publishStatusStyle.published.text
                    : publishStatusStyle.unPublish.text
                )}
              </MyTag>
            </Flex>
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
    onCloseImport,
    showSaveStatus,
    t
  ]);

  return Render;
};

export default AppCard;
