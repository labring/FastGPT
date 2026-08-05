import React, { useMemo } from 'react';
import { Box, Button, Flex, Portal, Text, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppContext } from '../../context';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { SystemConfigForm } from './nodes/NodeSystemConfig';
import AppDetailPanelModal from '../../components/AppDetailPanelModal';
import { useWelcomeTextFoldState } from '@/components/core/app/useWelcomeTextFoldState';

const SYSTEM_CONFIG_DRAWER_MAX_WIDTH_PX = 400;

const SystemConfigDrawer = () => {
  const { t } = useTranslation();
  const { isOpen, onClose, onToggle } = useDisclosure();
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
          width={['100%', `${SYSTEM_CONFIG_DRAWER_MAX_WIDTH_PX}px`]}
          height={['100vh', 'calc(100vh - 67px)']}
          top={[0, '67px']}
          position={'fixed'}
          showMask={false}
        >
          <Flex
            w={'100%'}
            h={'100%'}
            minW={0}
            minH={0}
            p={6}
            flexDirection={'column'}
            alignItems={'flex-start'}
            overflow={'hidden'}
          >
            <Box w={'100%'} flexShrink={0}>
              <Flex h={'26px'} w={'100%'} justifyContent={'space-between'} alignItems={'center'}>
                <Text
                  color={'myGray.900'}
                  fontSize={'lg'}
                  fontWeight={'medium'}
                  lineHeight={'26px'}
                  letterSpacing={0}
                >
                  {t('workflow:template.system_config')}
                </Text>
                <Button
                  variant={'transparentBase'}
                  minW={0}
                  w={5}
                  h={5}
                  p={0}
                  color={'myGray.900'}
                  _hover={{ bg: 'transparent' }}
                  onClick={onClose}
                  aria-label={t('common:Close')}
                >
                  <MyIcon name={'common/closeLight'} w={4} />
                </Button>
              </Flex>
              <Box h={2} />
              <Box h={'1px'} w={'100%'} bg={'myGray.200'} />
            </Box>
            <Box
              w={'100%'}
              pt={4}
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
