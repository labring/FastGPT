import React, { useMemo } from 'react';
import { Box, CloseButton, Flex, IconButton, Portal, Text, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppContext } from '../../context';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { SystemConfigForm } from './nodes/NodeSystemConfig';
import { PluginConfigForm } from './nodes/NodePluginIO/PluginConfigForm';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import AppDetailPanelModal, {
  APP_DETAIL_PANEL_WIDTH_PX
} from '../../components/AppDetailPanelModal';
import { useAppEditorUIState } from '@/components/core/app/useAppEditorUIState';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemConfigAutoOpen } from './hooks/useSystemConfigAutoOpen';

const SystemConfigDrawer = () => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onToggle, onClose } = useDisclosure();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const isWorkflowTool = appDetail.type === AppTypeEnum.workflowTool;
  const setAppDetail = useContextSelector(AppContext, (v) => v.setAppDetail);
  const {
    isWelcomeTextFolded,
    toggleWelcomeTextFold,
    hasCompletedSystemConfigFirstEntryGuide,
    completeSystemConfigFirstEntryGuide
  } = useAppEditorUIState(appDetail._id);
  useSystemConfigAutoOpen({
    appId: appDetail._id,
    hasCompletedFirstEntryGuide: hasCompletedSystemConfigFirstEntryGuide,
    onCompleteFirstEntryGuide: completeSystemConfigFirstEntryGuide,
    onOpen
  });

  const chatConfig = useMemo(
    () =>
      getAppChatConfig({
        chatConfig: appDetail.chatConfig,
        isPublicFetch: true
      }),
    [appDetail.chatConfig]
  );

  return (
    <>
      <Box position={'absolute'} top={'130px'} left={6} zIndex={1}>
        <MyTooltip shouldWrapChildren={false} label={t('workflow:template.system_config')}>
          <IconButton
            icon={<MyIcon name={'core/app/configDrawerSetting'} boxSize={5} color={'myGray.400'} />}
            w={9}
            minW={9}
            h={9}
            p={1.5}
            borderRadius={'50%'}
            aria-label={t('workflow:template.system_config')}
            variant={'whitePrimary'}
            _hover={{ bg: 'myGray.50' }}
            border={'none'}
            boxShadow={'0 4px 5px rgba(19, 51, 107, 0.20), 0 0 0.5px rgba(19, 51, 107, 0.50)'}
            onClick={onToggle}
          />
        </MyTooltip>
      </Box>

      <Portal>
        <AppDetailPanelModal
          isOpen={isOpen}
          onClose={onClose}
          width={['100%', `${APP_DETAIL_PANEL_WIDTH_PX}px`]}
          height={['100vh', 'calc(100vh - 67px)']}
          top={[0, '67px']}
          position={'fixed'}
          placement={'left'}
          showMask={false}
          header={
            <Flex w={'100%'} justifyContent={'space-between'} alignItems={'center'}>
              <Text
                color={'myGray.900'}
                fontSize={'md'}
                fontWeight={'medium'}
                lineHeight={'24px'}
                letterSpacing={0}
              >
                {t('workflow:template.system_config')}
              </Text>
              <CloseButton size={'sm'} onClick={onClose} />
            </Flex>
          }
        >
          <Box
            w={'100%'}
            h={'100%'}
            minW={['100vw', `${APP_DETAIL_PANEL_WIDTH_PX}px`]}
            minH={0}
            px={6}
            pb={6}
            overflowY={'auto'}
            overflowX={'hidden'}
            sx={{
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': {
                display: 'none'
              }
            }}
          >
            {isWorkflowTool ? (
              <PluginConfigForm chatConfig={chatConfig} setAppDetail={setAppDetail} />
            ) : (
              <SystemConfigForm
                chatConfig={chatConfig}
                setAppDetail={setAppDetail}
                mode={'drawer'}
                isWelcomeTextFolded={isWelcomeTextFolded}
                onToggleWelcomeTextFold={toggleWelcomeTextFold}
              />
            )}
          </Box>
        </AppDetailPanelModal>
      </Portal>
    </>
  );
};

export default React.memo(SystemConfigDrawer);
