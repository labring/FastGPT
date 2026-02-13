import { GridItem, Grid } from '@chakra-ui/react';
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
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { DEFAULT_LOGO_BANNER_URL } from '@/pageComponents/chat/constants';

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

  const appName = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app.name);
  const appAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app.avatar);

  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);

  const isHomePane = pane === ChatSidebarPaneEnum.HOME;
  const isTeamAppsPane = pane === ChatSidebarPaneEnum.TEAM_APPS;
  const isFavouriteAppPane = pane === ChatSidebarPaneEnum.FAVORITE_APPS;

  return isPc ? (
    <Flex pt={5} px={[2, 5]} alignItems={'center'} fontSize={'sm'} pb={title ? 0 : 2}>
      {!title && <Avatar src={appAvatar} borderRadius={'md'} />}

      <Box
        flex={'1 0 0'}
        w={0}
        ml={2}
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
      <Flex align={'center'} justify={'flex-start'} p={2}>
        <Image src={banner || DEFAULT_LOGO_BANNER_URL} alt="banner" w="60%" />
      </Flex>

      <MyDivider h="0.5px" bg="myGray.100" my={2} mx={2} w="calc(100% - 16px)" />

      <Grid templateRows="repeat(1, 1fr)" rowGap={2} py={2}>
        {enableHome && (
          <GridItem
            onClick={() => {
              handlePaneChange(ChatSidebarPaneEnum.HOME);
              onCloseSlider();
              setChatId();
            }}
          >
            <Flex
              p={2}
              mx={2}
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
            >
              <MyIcon name="core/chat/sidebar/home" w="20px" h="20px" />
              <Box fontSize="sm" fontWeight={500} flexShrink={0} whiteSpace="nowrap">
                {t('chat:sidebar.home')}
              </Box>
            </Flex>
          </GridItem>
        )}

        <GridItem
          onClick={() => {
            handlePaneChange(ChatSidebarPaneEnum.FAVORITE_APPS);
            onCloseSlider();
            setChatId();
          }}
        >
          <Flex
            p={2}
            mx={2}
            gap={2}
            cursor={'pointer'}
            borderRadius={'8px'}
            alignItems={'center'}
            bg={isFavouriteAppPane ? 'primary.100' : 'transparent'}
            color={isFavouriteAppPane ? 'primary.600' : 'myGray.500'}
            _hover={{
              bg: 'primary.100',
              color: 'primary.600'
            }}
          >
            <MyIcon name="core/chat/sidebar/star" w="20px" h="20px" />
            <Box fontSize="sm" fontWeight={500} flexShrink={0} whiteSpace="nowrap">
              {t('chat:sidebar.favourite_apps')}
            </Box>
          </Flex>
        </GridItem>

        <GridItem
          onClick={() => {
            handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS);
            onCloseSlider();
          }}
        >
          <Flex
            p={2}
            mx={2}
            gap={2}
            cursor={'pointer'}
            borderRadius={'8px'}
            alignItems={'center'}
            bg={isTeamAppsPane ? 'primary.100' : 'transparent'}
            color={isTeamAppsPane ? 'primary.600' : 'myGray.500'}
            _hover={{
              bg: 'primary.100',
              color: 'primary.600'
            }}
          >
            <MyIcon name="common/app" w="20px" h="20px" />
            <Box fontSize="sm" fontWeight={500} flexShrink={0} whiteSpace="nowrap">
              {t('chat:sidebar.team_apps')}
            </Box>
          </Flex>
        </GridItem>
      </Grid>
    </>
  );
};

export default ChatSliderHeader;
