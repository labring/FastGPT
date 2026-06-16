import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

const ChatSliderList = () => {
  const { isPc } = useSystem();
  const { t } = useTranslation();

  const { chatId: activeChatId, appId } = useChatStore();

  const histories = useContextSelector(ChatContext, (v) => v.histories);
  const ScrollData = useContextSelector(ChatContext, (v) => v.ScrollData);
  const onDelHistory = useContextSelector(ChatContext, (v) => v.onDelHistory);
  const onUpdateHistory = useContextSelector(ChatContext, (v) => v.onUpdateHistory);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);

  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const clearChatRecords = useContextSelector(ChatItemContext, (v) => v.clearChatRecords);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);

  const concatHistory = useMemo(() => {
    const newChatTitle = t('common:core.chat.New Chat');
    const getHistoryDisplayTitle = (title?: string) => title?.trim() || newChatTitle;
    const scopedHistories = histories.filter((item) => item.appId === appId);

    const formatHistories: {
      id: string;
      title: string;
      customTitle?: string;
      top?: boolean;
      updateTime: Date;
      chatGenerateStatus?: ChatGenerateStatusEnum;
      hasBeenRead?: boolean;
      isTemporary?: boolean;
    }[] = scopedHistories.map((item) => {
      const isActiveChat =
        item.chatId === activeChatId &&
        chatBoxData.chatId === item.chatId &&
        chatBoxData.appId === item.appId;
      const customTitle = item.customTitle?.trim() ? item.customTitle : undefined;
      const realtimeTitle = chatBoxData.title?.trim() ? chatBoxData.title : undefined;
      const title = (isActiveChat ? realtimeTitle : undefined) || customTitle || item.title;

      return {
        id: item.chatId,
        title: getHistoryDisplayTitle(title),
        customTitle,
        top: item.top,
        updateTime: item.updateTime,
        chatGenerateStatus: isActiveChat
          ? (chatBoxData.chatGenerateStatus ?? item.chatGenerateStatus)
          : item.chatGenerateStatus,
        hasBeenRead: isActiveChat ? (chatBoxData.hasBeenRead ?? item.hasBeenRead) : item.hasBeenRead
      };
    });

    const newChat: {
      id: string;
      title: string;
      customTitle?: string;
      top?: boolean;
      updateTime: Date;
      chatGenerateStatus?: ChatGenerateStatusEnum;
      hasBeenRead?: boolean;
      isTemporary?: boolean;
    } = {
      id: activeChatId,
      title: getHistoryDisplayTitle(chatBoxData.chatId === activeChatId ? chatBoxData.title : ''),
      updateTime: new Date(),
      isTemporary: true,
      chatGenerateStatus:
        chatBoxData.chatId === activeChatId ? chatBoxData.chatGenerateStatus : undefined,
      hasBeenRead: chatBoxData.chatId === activeChatId ? chatBoxData.hasBeenRead : undefined
    };
    const activeChat = scopedHistories.find((item) => item.chatId === activeChatId);
    const shouldPrependActiveChat = !!appId && !!activeChatId && !activeChat;

    return shouldPrependActiveChat ? [newChat].concat(formatHistories) : formatHistories;
  }, [
    activeChatId,
    appId,
    histories,
    t,
    chatBoxData.chatId,
    chatBoxData.appId,
    chatBoxData.title,
    chatBoxData.chatGenerateStatus,
    chatBoxData.hasBeenRead
  ]);

  // custom title edit
  const { onOpenModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:core.chat.Custom History Title'),
    placeholder: t('common:core.chat.Custom History Title Description')
  });

  return (
    <>
      {/* 移动端侧栏只需要纵向滚动；隐藏横向滚动条，避免底部语言入口上方出现灰线。 */}
      {/* eslint-disable-next-line react-hooks/static-components -- ScrollData is supplied by useScrollPagination. */}
      <ScrollData
        flex={'1 0 0'}
        h={0}
        pt={0}
        pl={0}
        pr={'16px'}
        pb={'16px'}
        mr={'-16px'}
        overflowY={'auto'}
        overflowX={'hidden'}
        sx={{
          '& > div > div:last-of-type:not(.chatHistoryItem)': {
            color: 'var(--chakra-colors-myGray-400)'
          }
        }}
      >
        {concatHistory.map((item, i) => (
          <Flex
            position={'relative'}
            className="chatHistoryItem"
            key={item.id}
            alignItems={'center'}
            p="8px"
            h={'40px'}
            minH={'40px'}
            cursor={'pointer'}
            userSelect={'none'}
            borderRadius={'md'}
            fontSize={'sm'}
            _hover={{
              bg: 'myGray.50',
              '& .more': {
                display: 'block'
              },
              '& .unreadDot': {
                display: 'none'
              },
              '& .time': {
                display: isPc ? 'none' : 'block'
              }
            }}
            bg={item.top ? '#E6F6F6 !important' : ''}
            {...(item.id === activeChatId
              ? {
                  backgroundColor: 'primary.100 !important',
                  color: 'primary.600'
                }
              : {
                  onClick: () => {
                    onChangeChatId(item.id);
                    setCiteModalData(undefined);
                  }
                })}
            {...(i !== concatHistory.length - 1 && {
              mb: '4px'
            })}
          >
            <Box flex={'1 0 0'} className="textEllipsis">
              {item.title}
            </Box>
            {!!item.id && (
              <Flex gap={2} alignItems={'center'}>
                {item.hasBeenRead === false &&
                item.chatGenerateStatus !== ChatGenerateStatusEnum.generating ? (
                  <Box
                    className="unreadDot"
                    w={'8px'}
                    h={'8px'}
                    borderRadius={'full'}
                    bg={'primary.500'}
                    flexShrink={0}
                  />
                ) : item.isTemporary ? null : (
                  <Box
                    className="time"
                    display={'block'}
                    fontWeight={'400'}
                    fontSize={'mini'}
                    color={
                      item.chatGenerateStatus === ChatGenerateStatusEnum.generating
                        ? 'primary.600'
                        : 'myGray.500'
                    }
                  >
                    {item.chatGenerateStatus === ChatGenerateStatusEnum.generating
                      ? t('chat:history_generating')
                      : t(formatTimeToChatTime(item.updateTime) as any).replace('#', ':')}
                  </Box>
                )}
                <Box className="more" display={['block', 'none']}>
                  <MyMenu
                    Button={
                      <IconButton
                        size={'xs'}
                        variant={'ghost'}
                        border={'none'}
                        bg={'transparent'}
                        color={'myGray.500'}
                        _hover={{ bg: 'transparent', color: 'myGray.700' }}
                        _active={{ bg: 'transparent' }}
                        icon={<MyIcon name={'more'} w={'14px'} p={1} color={'currentColor'} />}
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
                                clearChatRecords();
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
      </ScrollData>

      <EditTitleModal />
    </>
  );
};

export default ChatSliderList;
