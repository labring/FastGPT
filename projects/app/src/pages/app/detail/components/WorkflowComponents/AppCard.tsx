import React, { useCallback, useMemo } from 'react';
import { Box, Flex, HStack, useDisclosure } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { WorkflowContext } from './context';
import { filterSensitiveNodesData } from '@/web/core/workflow/utils';
import dynamic from 'next/dynamic';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { publishStatusStyle } from '../constants';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { fileDownload } from '@/web/common/file/utils';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';

const ImportSettings = dynamic(() => import('./Flow/ImportSettings'));

const AppCard = ({
  showSaveStatus,
  isPublished
}: {
  showSaveStatus: boolean;
  isPublished: boolean;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const { appDetail, onOpenInfoEdit, onOpenTeamTagModal, onDelApp, currentTab } =
    useContextSelector(AppContext, (v) => v);
  const { showHistoryModal } = useContextSelector(WorkflowContext, (v) => v);

  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();

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
                  label: t('app:edit_info'),
                  onClick: onOpenInfoEdit
                },
                {
                  icon: 'support/team/key',
                  label: t('common:common.Role'),
                  onClick: onOpenInfoEdit
                }
              ]
            },
            ...(!showHistoryModal && currentTab === TabEnum.appEdit
              ? [
                  {
                    children: [
                      {
                        label: t('app:import_configs'),
                        icon: 'common/importLight',
                        onClick: onOpenImport
                      },
                      {
                        label: ExportPopover({
                          chatConfig: appDetail.chatConfig,
                          appName: appDetail.name
                        }),
                        menuItemStyles: {
                          p: 0,
                          cursor: 'default'
                        }
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
      appDetail.chatConfig,
      appDetail.name,
      appDetail.permission.hasWritePer,
      appDetail.permission.isOwner,
      currentTab,
      feConfigs?.show_team_chat,
      showHistoryModal,
      onDelApp,
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

function ExportPopover({
  chatConfig,
  appName
}: {
  chatConfig: AppChatConfigType;
  appName: string;
}) {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { flowData2StoreDataAndCheck } = useContextSelector(WorkflowContext, (v) => v);

  const onExportWorkflow = useCallback(async () => {
    const data = flowData2StoreDataAndCheck();
    if (data) {
      copyData(
        JSON.stringify(
          {
            nodes: filterSensitiveNodesData(data.nodes),
            edges: data.edges,
            chatConfig: chatConfig
          },
          null,
          2
        ),
        t('app:export_config_successful')
      );
    }
  }, [chatConfig, copyData, flowData2StoreDataAndCheck, t]);

  return (
    <MyPopover
      placement={'right-start'}
      offset={[0, 0]}
      hasArrow
      trigger={'hover'}
      w={'8.6rem'}
      Trigger={
        <Flex align={'center'} w={'100%'} py={2} px={3}>
          <Avatar src={'export'} borderRadius={'sm'} w={'1rem'} mr={3} />
          {t('app:export_configs')}
        </Flex>
      }
    >
      {({ onClose }) => (
        <Box p={1}>
          <Flex
            py={'0.38rem'}
            px={1}
            color={'myGray.600'}
            _hover={{
              bg: 'myGray.05',
              color: 'primary.600',
              cursor: 'pointer'
            }}
            borderRadius={'xs'}
            onClick={onExportWorkflow}
          >
            <MyIcon name={'copy'} w={'1rem'} mr={2} />
            <Box fontSize={'mini'}>{t('common:common.copy_to_clipboard')}</Box>
          </Flex>
          <Flex
            py={'0.38rem'}
            px={1}
            color={'myGray.600'}
            _hover={{
              bg: 'myGray.05',
              color: 'primary.600',
              cursor: 'pointer'
            }}
            borderRadius={'xs'}
            onClick={() => {
              const data = flowData2StoreDataAndCheck();

              if (!data) return;

              fileDownload({
                text: JSON.stringify(
                  {
                    nodes: filterSensitiveNodesData(data.nodes),
                    edges: data.edges,
                    chatConfig: chatConfig
                  },
                  null,
                  2
                ),
                type: 'application/json;charset=utf-8',
                filename: `${appName}.json`
              });
            }}
          >
            <MyIcon name={'configmap'} w={'1rem'} mr={2} />
            <Box fontSize={'mini'}>{t('common:common.export_to_json')}</Box>
          </Flex>
        </Box>
      )}
    </MyPopover>
  );
}

export default AppCard;
