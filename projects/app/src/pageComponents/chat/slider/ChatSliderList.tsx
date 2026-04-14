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

  const { chatId: activeChatId } = useChatStore();

  const histories = useContextSelector(ChatContext, (v) => v.histories);
  const ScrollData = useContextSelector(ChatContext, (v) => v.ScrollData);
  const onDelHistory = useContextSelector(ChatContext, (v) => v.onDelHistory);
  const onUpdateHistory = useContextSelector(ChatContext, (v) => v.onUpdateHistory);
  const onChangeChatId = useContextSelector(ChatContext, (v) => v.onChangeChatId);

  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);

  const concatHistory = useMemo(() => {
    const formatHistories: {
      id: string;
      title: string;
      customTitle?: string;
      top?: boolean;
      updateTime: Date;
      chatGenerateStatus?: ChatGenerateStatusEnum;
      hasBeenRead?: boolean;
    }[] = histories.map((item) => {
      const isActiveChat = item.chatId === activeChatId && chatBoxData.chatId === item.chatId;

      return {
        id: item.chatId,
        title: item.title,
        customTitle: item.customTitle,
        top: item.top,
        updateTime: item.updateTime,
        chatGenerateStatus: isActiveChat
          ? chatBoxData.chatGenerateStatus ?? item.chatGenerateStatus
          : item.chatGenerateStatus,
        hasBeenRead: isActiveChat ? chatBoxData.hasBeenRead ?? item.hasBeenRead : item.hasBeenRead
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
    } = {
      id: activeChatId,
      title: t('common:core.chat.New Chat'),
      updateTime: new Date(),
      chatGenerateStatus:
        chatBoxData.chatId === activeChatId ? chatBoxData.chatGenerateStatus : undefined,
      hasBeenRead: chatBoxData.chatId === activeChatId ? chatBoxData.hasBeenRead : undefined
    };
    const activeChat = histories.find((item) => item.chatId === activeChatId);

    return !activeChat ? [newChat].concat(formatHistories) : formatHistories;
  }, [
    activeChatId,
    histories,
    t,
    chatBoxData.chatId,
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
      <ScrollData flex={'1 0 0'} h={0} px={[2, 5]} overflow={'overlay'}>
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
                ) : (
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
      </ScrollData>

      <EditTitleModal />
    </>
  );
};

export default ChatSliderList;
