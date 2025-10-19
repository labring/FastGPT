import React, { useCallback, useMemo } from 'react';
import { Box, Flex, HStack, useDisclosure } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { publishStatusStyle } from '../constants';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { WorkflowUtilsContext } from './context/workflowUtilsContext';

const ImportSettings = dynamic(() => import('./Flow/ImportSettings'));
const ExportConfigPopover = dynamic(
  () => import('@/pageComponents/app/detail/ExportConfigPopover')
);

const AppCard = ({ showSaveStatus, isSaved }: { showSaveStatus: boolean; isSaved: boolean }) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const onOpenInfoEdit = useContextSelector(AppContext, (v) => v.onOpenInfoEdit);
  const onOpenTeamTagModal = useContextSelector(AppContext, (v) => v.onOpenTeamTagModal);
  const onDelApp = useContextSelector(AppContext, (v) => v.onDelApp);
  const flowData2StoreData = useContextSelector(WorkflowUtilsContext, (v) => v.flowData2StoreData);

  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();

  const InfoMenu = useCallback(
    ({ children }: { children: React.ReactNode }) => {
      return (
        <MyPopover
          placement={'bottom-end'}
          hasArrow={false}
          offset={[2, 4]}
          w={'116px'}
          trigger={'hover'}
          Trigger={children}
        >
          {({ onClose }) => (
            <Box p={1.5}>
              <MyBox
                display={'flex'}
                size={'md'}
                px={1}
                py={1.5}
                rounded={'4px'}
                _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
                cursor={'pointer'}
                onClick={onOpenInfoEdit}
              >
                <MyIcon name={'edit'} w={'16px'} mr={2} />
                <Box fontSize={'sm'}>{t('app:edit_info')}</Box>
              </MyBox>
              <MyBox
                display={'flex'}
                size={'md'}
                px={1}
                py={1.5}
                rounded={'4px'}
                _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
                cursor={'pointer'}
                onClick={onOpenInfoEdit}
              >
                <MyIcon name={'key'} w={'16px'} mr={2} />
                <Box fontSize={'sm'}>{t('app:Role_setting')}</Box>
              </MyBox>
              <Box w={'full'} h={'1px'} bg={'myGray.200'} my={1} />
              <MyBox
                display={'flex'}
                size={'md'}
                px={1}
                py={1.5}
                rounded={'4px'}
                _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
                cursor={'pointer'}
                onClick={onOpenImport}
              >
                <MyIcon name={'common/importLight'} w={'16px'} mr={2} />
                <Box fontSize={'sm'}>{t('app:import_configs')}</Box>
              </MyBox>
              <MyBox
                display={'flex'}
                size={'md'}
                px={1}
                py={1.5}
                rounded={'4px'}
                _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
                cursor={'pointer'}
              >
                <ExportConfigPopover
                  chatConfig={appDetail.chatConfig}
                  appName={appDetail.name}
                  getWorkflowData={flowData2StoreData}
                />
              </MyBox>
              {appDetail.permission.hasWritePer && feConfigs?.show_team_chat && (
                <>
                  <Box w={'full'} h={'1px'} bg={'myGray.200'} my={1} />

                  <MyBox
                    display={'flex'}
                    size={'md'}
                    px={1}
                    py={1.5}
                    rounded={'4px'}
                    _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
                    cursor={'pointer'}
                    onClick={onOpenTeamTagModal}
                  >
                    <MyIcon name={'core/dataset/tag'} w={'16px'} mr={2} />
                    <Box fontSize={'sm'}>{t('app:Team_Tags')}</Box>
                  </MyBox>
                </>
              )}

              {appDetail.permission.isOwner && (
                <>
                  <Box w={'full'} h={'1px'} bg={'myGray.200'} my={1} />

                  <MyBox
                    display={'flex'}
                    size={'md'}
                    px={1}
                    py={1.5}
                    rounded={'4px'}
                    color={'red.600'}
                    _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
                    cursor={'pointer'}
                    onClick={onDelApp}
                  >
                    <MyIcon name={'delete'} w={'16px'} mr={2} />
                    <Box fontSize={'sm'}>{t('common:Delete')}</Box>
                  </MyBox>
                </>
              )}
            </Box>
          )}
        </MyPopover>
      );
    },
    [
      appDetail.chatConfig,
      appDetail.name,
      appDetail.permission.hasWritePer,
      appDetail.permission.isOwner,
      feConfigs?.show_team_chat,
      flowData2StoreData,
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
        <Avatar src={appDetail.avatar} w={'1.75rem'} borderRadius={'md'} />
        <Box>
          <InfoMenu>
            <HStack
              spacing={1}
              cursor={'pointer'}
              pl={1}
              ml={-1}
              borderRadius={'xs'}
              _hover={{ bg: 'myGray.150' }}
            >
              <Box color={'myGray.900'}>{appDetail.name}</Box>
              <MyIcon name={'common/select'} w={'1rem'} color={'myGray.500'} />
            </HStack>
          </InfoMenu>
          {showSaveStatus && (
            <Flex alignItems={'center'} fontSize={'mini'} lineHeight={1}>
              <MyTag
                py={0}
                px={1}
                showDot
                bg={'transparent'}
                colorSchema={
                  isSaved
                    ? publishStatusStyle.published.colorSchema
                    : publishStatusStyle.unPublish.colorSchema
                }
              >
                {t(isSaved ? publishStatusStyle.published.text : publishStatusStyle.unPublish.text)}
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
    isSaved,
    onCloseImport,
    showSaveStatus,
    t
  ]);

  return Render;
};

export default AppCard;
