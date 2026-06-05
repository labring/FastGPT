import React from 'react';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useTranslation } from 'react-i18next';
import { Box, Flex, Image } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { DEFAULT_LOGO_BANNER_URL } from '@/pageComponents/chat/constants';
import ChatSliderQuickAppList from '@/pageComponents/chat/slider/ChatSliderQuickAppList';

type Props = {
  title?: string;
  banner?: string;
};

const ChatSliderHeader = ({ title, banner }: Props) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { setChatId } = useChatStore();

  const pane = useContextSelector(ChatPageContext, (v) => v.pane);
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);
  const enableHome = useContextSelector(ChatPageContext, (v) => v.chatSettings?.enableHome);
  const homeAppId = useContextSelector(ChatPageContext, (v) => v.chatSettings?.appId);

  const appName = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app.name);
  const appAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app.avatar);
  const currentAppId = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.appId);

  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);

  const isHomePane = pane === ChatSidebarPaneEnum.HOME && currentAppId === homeAppId;
  const isAllAppsPane = pane === ChatSidebarPaneEnum.ALL_APPS;

  return isPc ? (
    <Flex py={4} px={[2, 2]} gap={2} alignItems={'center'} fontSize={'sm'}>
      {!title && <Avatar src={appAvatar} borderRadius={'md'} />}

      <Box
        flex={'1 0 0'}
        w={0}
        fontWeight={'bold'}
        fontSize={title ? '16px' : 'inherit'}
        color={title ? 'myGray.900' : 'inherit'}
        className={'textEllipsis'}
      >
        {title || appName}
      </Box>
    </Flex>
  ) : (
    <>
      <Flex align={'center'} justify={'flex-start'} pl="8px" pr="12px" pb="16px">
        <Image src={banner || DEFAULT_LOGO_BANNER_URL} alt="banner" w="60%" maxW="100%" />
      </Flex>

      <Flex flexDir="column" gap="4px">
        {enableHome && (
          <Flex
            p="8px"
            gap={2}
            cursor={'pointer'}
            borderRadius={'8px'}
            alignItems={'center'}
            bg={isHomePane ? 'primary.100' : 'transparent'}
            color={isHomePane ? 'primary.600' : 'myGray.500'}
            _hover={{
              bg: 'primary.100',
              color: 'primary.600'
            }}
            onClick={() => {
              handlePaneChange(ChatSidebarPaneEnum.HOME);
              onCloseSlider();
              setChatId();
            }}
          >
            <MyIcon name="core/chat/sidebar/home" w="20px" h="20px" />
            <Box fontSize="sm" fontWeight={500} flexShrink={0} whiteSpace="nowrap">
              {t('chat:sidebar.home')}
            </Box>
          </Flex>
        )}

        <Flex
          p="8px"
          gap={2}
          cursor={'pointer'}
          borderRadius={'8px'}
          alignItems={'center'}
          bg={isAllAppsPane ? 'primary.100' : 'transparent'}
          color={isAllAppsPane ? 'primary.600' : 'myGray.500'}
          _hover={{
            bg: 'primary.100',
            color: 'primary.600'
          }}
          onClick={() => {
            handlePaneChange(ChatSidebarPaneEnum.ALL_APPS);
            onCloseSlider();
            setChatId();
          }}
        >
          <MyIcon name="common/app" w="20px" h="20px" />
          <Box fontSize="sm" fontWeight={500} flexShrink={0} whiteSpace="nowrap">
            {t('chat:sidebar.all_apps')}
          </Box>
        </Flex>

        <ChatSliderQuickAppList />
      </Flex>
    </>
  );
};

export default ChatSliderHeader;
