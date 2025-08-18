import React, { useCallback, useMemo } from 'react';
import { Grid, Image, Box, Button, Flex, useTheme, IconButton, GridItem } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import { ChatSidebarPaneEnum, DEFAULT_LOGO_BANNER_URL } from '@/pageComponents/chat/constants';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useMemoizedFn } from 'ahooks';
import { useUserStore } from '@/web/support/user/useUserStore';
import UserAvatarPopover from '@/pageComponents/chat/UserAvatarPopover';
import { usePathname } from 'next/navigation';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/setting/type';

type HistoryItemType = {
  id: string;
  title: string;
  customTitle?: string;
  top?: boolean;
  updateTime: Date;
};

const ChatHistorySlider = ({
  confirmClearText,
  customSliderTitle,
  pane,
  chatSettings,
  onPaneChange
}: {
  confirmClearText: string;
  customSliderTitle?: string;
  pane: ChatSidebarPaneEnum;
  chatSettings: ChatSettingSchema | undefined;
  onPaneChange?: (pane: ChatSidebarPaneEnum) => void;
}) => {
  const theme = useTheme();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const { userInfo } = useUserStore();

  const { chatId: activeChatId, setChatId } = useChatStore();
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);
  const ScrollData = useContextSelector(ChatContext, (v) => v.ScrollData);
  const histories = useContextSelector(ChatContext, (v) => v.histories);
  const onDelHistory = useContextSelector(ChatContext, (v) => v.onDelHistory);
  const onClearHistory = useContextSelector(ChatContext, (v) => v.onClearHistories);
  const onUpdateHistory = useContextSelector(ChatContext, (v) => v.onUpdateHistory);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);

  const appName = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app.name);
  const appAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app.avatar);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const isActivePane = useCallback((active: ChatSidebarPaneEnum) => active === pane, [pane]);

  const isShare = pathname === '/chat/share';

  const concatHistory = useMemo(() => {
    const formatHistories: HistoryItemType[] = histories.map((item) => {
      return {
        id: item.chatId,
        title: item.title,
        customTitle: item.customTitle,
        top: item.top,
        updateTime: item.updateTime
      };
    });
    const newChat: HistoryItemType = {
      id: activeChatId,
      title: t('common:core.chat.New Chat'),
      updateTime: new Date()
    };
    const activeChat = histories.find((item) => item.chatId === activeChatId);

    return !activeChat ? [newChat].concat(formatHistories) : formatHistories;
  }, [activeChatId, histories, t]);

  // custom title edit
  const { onOpenModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:core.chat.Custom History Title'),
    placeholder: t('common:core.chat.Custom History Title Description')
  });

  return (
    <MyBox
      display={'flex'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      bg={'white'}
      borderRight={['', theme.borders.base]}
      whiteSpace={'nowrap'}
    >
      {isPc && (
        <Flex
          pt={5}
          px={[2, 5]}
          alignItems={'center'}
          fontSize={'sm'}
          pb={customSliderTitle ? 0 : 2}
        >
          {!customSliderTitle && <Avatar src={appAvatar} borderRadius={'md'} />}

          <Box
            flex={'1 0 0'}
            w={0}
            ml={2}
            fontWeight={'bold'}
            fontSize={customSliderTitle ? '16px' : 'inherit'}
            color={customSliderTitle ? 'myGray.900' : 'inherit'}
            className={'textEllipsis'}
          >
            {customSliderTitle || appName}
          </Box>
        </Flex>
      )}

      {!isPc && (
        <>
          <Flex align={'center'} justify={'flex-start'} p={2}>
            <Image
              src={chatSettings?.wideLogoUrl || DEFAULT_LOGO_BANNER_URL}
              alt="banner"
              w="70%"
            />
          </Flex>

          <MyDivider h="0.5px" bg="myGray.100" my={2} mx={2} w="calc(100% - 16px)" />

          {!isShare && (
            <>
              <Grid templateRows="repeat(1, 1fr)" rowGap={2} py={2}>
                <GridItem
                  onClick={() => {
                    onPaneChange?.(ChatSidebarPaneEnum.HOME);
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
                    bg={isActivePane(ChatSidebarPaneEnum.HOME) ? 'primary.100' : 'transparent'}
                    color={isActivePane(ChatSidebarPaneEnum.HOME) ? 'primary.600' : 'myGray.500'}
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

                <GridItem
                  onClick={() => {
                    onPaneChange?.(ChatSidebarPaneEnum.TEAM_APPS);
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
                    bg={isActivePane(ChatSidebarPaneEnum.TEAM_APPS) ? 'primary.100' : 'transparent'}
                    color={
                      isActivePane(ChatSidebarPaneEnum.TEAM_APPS) ? 'primary.600' : 'myGray.500'
                    }
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
              <MyDivider h="0.5px" bg="myGray.100" my={2} mx={2} w="calc(100% - 16px)" />
            </>
          )}
        </>
      )}

      {/* menu */}
      <Flex
        w={'100%'}
        px={[2, 5]}
        h={'36px'}
        my={5}
        justify={['space-between', '']}
        alignItems={'center'}
      >
        {!isPc && (
          <Flex height={'100%'} align={'center'} justify={'center'}>
            <MyIcon ml={2} name="core/chat/sideLine" />
            <Box ml={2} fontWeight={'bold'}>
              {t('common:core.chat.History')}
            </Box>
          </Flex>
        )}

        <Button
          variant={'whitePrimary'}
          flex={['0 0 auto', 1]}
          h={'100%'}
          px={6}
          color={'primary.600'}
          borderRadius={'xl'}
          leftIcon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
          overflow={'hidden'}
          onClick={() => {
            onChangeChatId();
            setCiteModalData(undefined);
          }}
        >
          {t('common:core.chat.New Chat')}
        </Button>
        {/* Clear */}
        {isPc && histories.length > 0 && (
          <PopoverConfirm
            Trigger={
              <Box ml={3} h={'100%'}>
                <IconButton
                  variant={'whiteDanger'}
                  size={'mdSquare'}
                  aria-label={''}
                  borderRadius={'50%'}
                  icon={<MyIcon name={'common/clearLight'} w={'16px'} />}
                />
              </Box>
            }
            type="delete"
            content={confirmClearText}
            onConfirm={() => onClearHistory()}
          />
        )}
      </Flex>

      <ScrollData flex={'1 0 0'} h={0} px={[2, 5]} overflow={'overlay'}>
        {/* chat history */}
        <>
          {concatHistory.map((item, i) => (
            <Flex
              position={'relative'}
              key={item.id}
              alignItems={'center'}
              px={4}
              h={'44px'}
              cursor={'pointer'}
              userSelect={'none'}
              borderRadius={'md'}
              fontSize={'sm'}
              _hover={{
                bg: 'myGray.50',
                '& .more': {
                  display: 'block'
                },
                '& .time': {
                  display: isPc ? 'none' : 'block'
                }
              }}
              bg={item.top ? '#E6F6F6 !important' : ''}
              {...(item.id === activeChatId
                ? {
                    backgroundColor: 'primary.50 !important',
                    color: 'primary.600'
                  }
                : {
                    onClick: () => {
                      onChangeChatId(item.id);
                      setCiteModalData(undefined);
                    }
                  })}
              {...(i !== concatHistory.length - 1 && {
                mb: '8px'
              })}
            >
              <MyIcon
                name={item.id === activeChatId ? 'core/chat/chatFill' : 'core/chat/chatLight'}
                w={'16px'}
              />
              <Box flex={'1 0 0'} ml={3} className="textEllipsis">
                {item.customTitle || item.title}
              </Box>
              {!!item.id && (
                <Flex gap={2} alignItems={'center'}>
                  <Box
                    className="time"
                    display={'block'}
                    fontWeight={'400'}
                    fontSize={'mini'}
                    color={'myGray.500'}
                  >
                    {t(formatTimeToChatTime(item.updateTime) as any).replace('#', ':')}
                  </Box>
                  <Box className="more" display={['block', 'none']}>
                    <MyMenu
                      Button={
                        <IconButton
                          size={'xs'}
                          variant={'whiteBase'}
                          icon={<MyIcon name={'more'} w={'14px'} p={1} />}
                          aria-label={''}
                        />
                      }
                      menuList={[
                        {
                          children: [
                            {
                              label: item.top
                                ? t('common:core.chat.Unpin')
                                : t('common:core.chat.Pin'),
                              icon: 'core/chat/setTopLight',
                              onClick: () => {
                                onUpdateHistory({
                                  chatId: item.id,
                                  top: !item.top
                                });
                              }
                            },

                            {
                              label: t('common:custom_title'),
                              icon: 'common/customTitleLight',
                              onClick: () => {
                                onOpenModal({
                                  defaultVal: item.customTitle || item.title,
                                  onSuccess: (e) =>
                                    onUpdateHistory({
                                      chatId: item.id,
                                      customTitle: e
                                    })
                                });
                              }
                            },
                            {
                              label: t('common:Delete'),
                              icon: 'delete',
                              onClick: () => {
                                onDelHistory(item.id);
                                if (item.id === activeChatId) {
                                  onChangeChatId();
                                  setCiteModalData(undefined);
                                }
                              },
                              type: 'danger'
                            }
                          ]
                        }
                      ]}
                    />
                  </Box>
                </Flex>
              )}
            </Flex>
          ))}
        </>
      </ScrollData>

      {!isPc && (
        <Flex flexShrink={0} gap={2} alignItems="center" justifyContent="space-between" p={2}>
          <UserAvatarPopover isCollapsed={false} placement="top-end">
            <Flex alignItems="center" gap={2} borderRadius="50%" p={2}>
              <Avatar src={userInfo?.avatar} w={8} h={8} borderRadius="50%" bg="myGray.200" />
              <Box className="textEllipsis" flexGrow={1} fontSize={'sm'} fontWeight={500} minW={0}>
                {userInfo?.username}
              </Box>
            </Flex>
          </UserAvatarPopover>

          {!isShare && (
            <Flex
              _hover={{ bg: 'myGray.200' }}
              bg={isActivePane(ChatSidebarPaneEnum.SETTING) ? 'myGray.200' : 'transparent'}
              borderRadius={'8px'}
              p={2}
              cursor={'pointer'}
              w="40px"
              h="40px"
              alignItems="center"
              justifyContent="center"
              onClick={() => {
                onPaneChange?.(ChatSidebarPaneEnum.SETTING);
                onCloseSlider();
              }}
            >
              <MyIcon
                w="20px"
                name="common/setting"
                fill={isActivePane(ChatSidebarPaneEnum.SETTING) ? 'primary.500' : 'myGray.400'}
              />
            </Flex>
          )}
        </Flex>
      )}

      <EditTitleModal />
    </MyBox>
  );
};

export default ChatHistorySlider;
