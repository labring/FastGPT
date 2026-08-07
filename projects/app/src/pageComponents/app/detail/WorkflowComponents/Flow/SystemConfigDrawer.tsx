import React, { useMemo } from 'react';
import { Box, Button, CloseButton, Flex, Portal, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppContext } from '../../context';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { SystemConfigForm } from './nodes/NodeSystemConfig';
import AppDetailPanelModal, {
  APP_DETAIL_PANEL_WIDTH_PX
} from '../../components/AppDetailPanelModal';
import { useWelcomeTextFoldState } from '@/components/core/app/useWelcomeTextFoldState';
import { WorkflowModalContext } from '../context/workflowModalContext';

const SystemConfigDrawer = () => {
  const { t } = useTranslation();
  const { activePanel, setActivePanel } = useContextSelector(WorkflowModalContext, (v) => ({
    activePanel: v.activePanel,
    setActivePanel: v.setActivePanel
  }));
  const isOpen = activePanel === 'system';
  const onToggle = () => setActivePanel(isOpen ? null : 'system');
  const onClose = () => setActivePanel(null);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const setAppDetail = useContextSelector(AppContext, (v) => v.setAppDetail);
  const { isWelcomeTextFolded, toggleWelcomeTextFold } = useWelcomeTextFoldState(appDetail._id);

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
      <Button
        aria-label={t('workflow:template.system_config')}
        title={t('workflow:template.system_config')}
        size={'baseSquare'}
        variant={'whitePrimary'}
        flexShrink={0}
        onClick={onToggle}
      >
        <MyIcon name={'core/app/configDrawerSetting'} w={'18px'} h={'18px'} />
      </Button>

      <Portal>
        <AppDetailPanelModal
          isOpen={isOpen}
          onClose={onClose}
          width={['100%', `${APP_DETAIL_PANEL_WIDTH_PX}px`]}
          height={['100vh', 'calc(100vh - 67px)']}
          top={[0, '67px']}
          position={'fixed'}
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
          <Flex
            w={'100%'}
            h={'100%'}
            minW={0}
            minH={0}
            px={6}
            pb={6}
            flexDirection={'column'}
            alignItems={'flex-start'}
            overflow={'hidden'}
          >
            <Box
              w={'100%'}
              flex={'1 1 auto'}
              minH={0}
              overflowY={'auto'}
              overflowX={'hidden'}
              sx={{
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': {
                  display: 'none'
                }
              }}
            >
              <SystemConfigForm
                chatConfig={chatConfig}
                setAppDetail={setAppDetail}
                mode={'drawer'}
                isWelcomeTextFolded={isWelcomeTextFolded}
                onToggleWelcomeTextFold={toggleWelcomeTextFold}
              />
            </Box>
          </Flex>
        </AppDetailPanelModal>
      </Portal>
    </>
  );
};

export default React.memo(SystemConfigDrawer);
