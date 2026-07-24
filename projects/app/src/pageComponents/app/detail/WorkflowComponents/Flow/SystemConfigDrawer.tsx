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
import { drawerZIndex } from '@/components/core/app/configDrawerStyles';
import { SystemConfigForm } from './nodes/NodeSystemConfig';

const WORKFLOW_NAVIGATION_HEIGHT = '67px';
const SYSTEM_CONFIG_DRAWER_NAVIGATION_OVERLAP = '1px';
const systemConfigDrawerTop = `calc(${WORKFLOW_NAVIGATION_HEIGHT} - ${SYSTEM_CONFIG_DRAWER_NAVIGATION_OVERLAP})`;
const systemConfigDrawerMaxHeight = `calc(100vh - ${systemConfigDrawerTop})`;

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
        minW={0}
        w={'34px'}
        h={'34px'}
        p={0}
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
        <DrawerOverlay bg={'transparent'} zIndex={drawerZIndex} />
        <DrawerContent
          zIndex={drawerZIndex}
          display={'flex'}
          w={'400px'}
          maxW={'400px'}
          h={'auto'}
          maxH={systemConfigDrawerMaxHeight}
          bottom={'auto'}
          mt={systemConfigDrawerTop}
          mr={0}
          p={'24px'}
          flexDirection={'column'}
          alignItems={'flex-start'}
          alignSelf={'flex-start'}
          borderRadius={'10px'}
          bg={'white'}
          overflow={'hidden'}
          boxShadow={'0 4px 10px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.10)'}
        >
          <Box w={'100%'} flexShrink={0}>
            <Flex h={'26px'} w={'100%'} justifyContent={'space-between'} alignItems={'center'}>
              <Text
                color={'#111824'}
                fontFamily={'PingFang SC'}
                fontSize={'20px'}
                fontWeight={500}
                lineHeight={'26px'}
                letterSpacing={'0.15px'}
              >
                {t('workflow:template.system_config')}
              </Text>
              <Button
                variant={'transparentBase'}
                minW={0}
                w={'20px'}
                h={'20px'}
                p={0}
                fontSize={'24px'}
                fontWeight={300}
                lineHeight={'20px'}
                color={'#111824'}
                _hover={{ bg: 'transparent' }}
                onClick={onClose}
                aria-label={t('common:Close')}
              >
                ×
              </Button>
            </Flex>
            <Box h={'8px'} />
            <Box h={'1px'} w={'100%'} bg={'#E8EBF0'} />
          </Box>
          <Box
            w={'100%'}
            pt={'16px'}
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
