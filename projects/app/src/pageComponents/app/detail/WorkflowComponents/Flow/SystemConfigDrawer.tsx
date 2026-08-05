import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerContent,
  DrawerOverlay,
  Flex,
  Text,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppContext } from '../../context';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { SystemConfigForm } from './nodes/NodeSystemConfig';

const WORKFLOW_DESKTOP_NAVIGATION_HEIGHT = '67px';
const SYSTEM_CONFIG_DRAWER_NAVIGATION_OVERLAP = '1px';
const systemConfigDrawerDesktopTop = `calc(${WORKFLOW_DESKTOP_NAVIGATION_HEIGHT} - ${SYSTEM_CONFIG_DRAWER_NAVIGATION_OVERLAP})`;
const systemConfigDrawerDesktopMaxHeight = `calc(100vh - ${systemConfigDrawerDesktopTop})`;

const SystemConfigDrawer = () => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const setAppDetail = useContextSelector(AppContext, (v) => v.setAppDetail);

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
        onClick={onOpen}
      >
        <MyIcon name={'core/app/configDrawerSetting'} w={'18px'} h={'18px'} />
      </Button>

      <Drawer
        isOpen={isOpen}
        placement="right"
        onClose={onClose}
        size={'sm'}
        trapFocus={false}
        blockScrollOnMount={false}
      >
        <DrawerOverlay bg={'transparent'} />
        <DrawerContent
          display={'flex'}
          w={'100%'}
          maxW={'400px'}
          h={['100vh', 'auto']}
          maxH={['100vh', systemConfigDrawerDesktopMaxHeight]}
          bottom={'auto'}
          mt={[0, systemConfigDrawerDesktopTop]}
          mr={0}
          p={6}
          flexDirection={'column'}
          alignItems={'flex-start'}
          alignSelf={'flex-start'}
          borderRadius={[0, 'semilg']}
          bg={'white'}
          overflow={'hidden'}
          boxShadow={'3.5'}
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
            <SystemConfigForm chatConfig={chatConfig} setAppDetail={setAppDetail} mode={'drawer'} />
          </Box>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default React.memo(SystemConfigDrawer);
