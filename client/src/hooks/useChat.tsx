import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { throttle } from 'lodash';
import { ChatSiteItemType } from '@/types/chat';
import { useToast } from './useToast';
import { useCopyData } from '@/utils/tools';
import { Box, Card, Flex, Textarea } from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useRouter } from 'next/router';

import { Types } from 'mongoose';
import { HUMAN_ICON } from '@/constants/chat';
import Markdown from '@/components/Markdown';
import MyIcon from '@/components/Icon';
import Avatar from '@/components/Avatar';

import styles from './useChat.module.scss';
import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { streamFetch } from '@/api/fetch';

const textareaMinH = '22px';

export const useChat = ({ appId }: { appId: string }) => {
  const router = useRouter();
  const ChatBoxParentRef = useRef<HTMLDivElement>(null);
  const TextareaDom = useRef<HTMLTextAreaElement>(null);

  // stop chat
  const controller = useRef(new AbortController());
  const isLeavePage = useRef(false);

  const [chatHistory, setChatHistory] = useState<ChatSiteItemType[]>([]);
  const { toast } = useToast();
  const { copyData } = useCopyData();
  const { userInfo } = useUserStore();

  const isChatting = useMemo(
    () => chatHistory[chatHistory.length - 1]?.status === 'loading',
    [chatHistory]
  );
  const isLargeWidth =
    ChatBoxParentRef?.current?.clientWidth && ChatBoxParentRef?.current?.clientWidth > 900;

  // 滚动到底部
  const scrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth') => {
    if (!ChatBoxParentRef.current) return;
    console.log(ChatBoxParentRef.current.scrollHeight);

    ChatBoxParentRef.current.scrollTo({
      top: ChatBoxParentRef.current.scrollHeight,
      behavior
    });
  }, []);

  // 聊天信息生成中……获取当前滚动条位置，判断是否需要滚动到底部
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const generatingMessage = useCallback(
    throttle(() => {
      if (!ChatBoxParentRef.current) return;
      const isBottom =
        ChatBoxParentRef.current.scrollTop + ChatBoxParentRef.current.clientHeight + 150 >=
        ChatBoxParentRef.current.scrollHeight;

      isBottom && scrollToBottom('auto');
    }, 100),
    []
  );

  // 复制内容
  const onclickCopy = useCallback(
    (value: string) => {
      const val = value.replace(/\n+/g, '\n');
      copyData(val);
    },
    [copyData]
  );

  // 重置输入内容
  const resetInputVal = useCallback((val: string) => {
    if (!TextareaDom.current) return;
    TextareaDom.current.value = val;
    setTimeout(() => {
      /* 回到最小高度 */
      if (TextareaDom.current) {
        TextareaDom.current.style.height =
          val === '' ? textareaMinH : `${TextareaDom.current.scrollHeight}px`;
      }
    }, 100);
  }, []);

  const startChat = useCallback(
    async (prompts: ChatSiteItemType[]) => {
      // create abort obj
      const abortSignal = new AbortController();
      controller.current = abortSignal;
      isLeavePage.current = false;

      const messages = adaptChatItem_openAI({ messages: prompts, reserveId: true });

      // 流请求，获取数据
      await streamFetch({
        data: {
          messages,
          appId,
          model: ''
        },
        onMessage: (text: string) => {
          setChatHistory((state) =>
            state.map((item, index) => {
              if (index !== state.length - 1) return item;
              return {
                ...item,
                value: item.value + text
              };
            })
          );
          generatingMessage();
        },
        abortSignal
      });

      // 重置了页面，说明退出了当前聊天, 不缓存任何内容
      if (isLeavePage.current) {
        return;
      }

      // 设置聊天内容为完成状态
      setChatHistory((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1) return item;
          return {
            ...item,
            status: 'finish'
          };
        })
      );

      setTimeout(() => {
        generatingMessage();
        TextareaDom.current?.focus();
      }, 100);
    },
    [appId, generatingMessage]
  );

  /**
   * user confirm send prompt
   */
  const sendPrompt = useCallback(async () => {
    if (isChatting) {
      toast({
        title: '正在聊天中...请等待结束',
        status: 'warning'
      });
      return;
    }
    // get input value
    const value = TextareaDom.current?.value || '';
    const val = value.trim().replace(/\n\s*/g, '\n');

    if (!val) {
      toast({
        title: '内容为空',
        status: 'warning'
      });
      return;
    }

    const newChatList: ChatSiteItemType[] = [
      ...chatHistory,
      {
        _id: String(new Types.ObjectId()),
        obj: 'Human',
        value: val,
        status: 'finish'
      },
      {
        _id: String(new Types.ObjectId()),
        obj: 'AI',
        value: '',
        status: 'loading'
      }
    ];

    // 插入内容
    setChatHistory(newChatList);

    // 清空输入内容
    resetInputVal('');
    setTimeout(() => {
      scrollToBottom();
    }, 100);

    try {
      await startChat(newChatList);
    } catch (err: any) {
      toast({
        title: typeof err === 'string' ? err : err?.message || '聊天出错了~',
        status: 'warning',
        duration: 5000,
        isClosable: true
      });

      resetInputVal(value);

      setChatHistory(newChatList.slice(0, newChatList.length - 2));
    }
  }, [isChatting, chatHistory, resetInputVal, toast, scrollToBottom, startChat]);

  const ChatBox = useCallback(
    ({ appAvatar }: { appAvatar: string }) => {
      return (
        <Box id={'history'}>
          {chatHistory.map((item, index) => (
            <Flex key={item._id} alignItems={'flex-start'} py={2}>
              {item.obj === 'Human' && <Box flex={1} />}
              {/* avatar */}
              <Avatar
                src={item.obj === 'Human' ? userInfo?.avatar || HUMAN_ICON : appAvatar}
                w={isLargeWidth ? '34px' : '24px'}
                h={isLargeWidth ? '34px' : '24px'}
                {...(item.obj === 'AI'
                  ? {
                      order: 1,
                      mr: ['6px', 2]
                    }
                  : {
                      order: 3,
                      ml: ['6px', 2]
                    })}
              />
              {/* message */}
              <Flex order={2} pt={2} maxW={`calc(100% - ${isLargeWidth ? '75px' : '58px'})`}>
                {item.obj === 'AI' ? (
                  <Box w={'100%'}>
                    <Card bg={'white'} px={4} py={3} borderRadius={'0 8px 8px 8px'}>
                      <Markdown
                        source={item.value}
                        isChatting={index === chatHistory.length - 1 && isChatting}
                      />
                    </Card>
                  </Box>
                ) : (
                  <Box>
                    <Card
                      className="markdown"
                      whiteSpace={'pre-wrap'}
                      px={4}
                      py={3}
                      borderRadius={'8px 0 8px 8px'}
                      bg={'myBlue.300'}
                    >
                      <Box as={'p'}>{item.value}</Box>
                    </Card>
                  </Box>
                )}
              </Flex>
            </Flex>
          ))}
        </Box>
      );
    },
    [chatHistory, isChatting, userInfo?.avatar]
  );

  const ChatInput = useCallback(() => {
    return (
      <Box m={['0 auto', '20px auto']} w={'100%'} maxW={['auto', 'min(750px, 100%)']}>
        <Box
          py={'18px'}
          position={'relative'}
          boxShadow={`0 0 10px rgba(0,0,0,0.1)`}
          borderTop={['1px solid', 0]}
          borderTopColor={'gray.200'}
          borderRadius={['none', 'md']}
          backgroundColor={'white'}
        >
          {/* 输入框 */}
          <Textarea
            ref={TextareaDom}
            py={0}
            pr={['45px', '55px']}
            border={'none'}
            _focusVisible={{
              border: 'none'
            }}
            placeholder="提问"
            resize={'none'}
            rows={1}
            height={'22px'}
            lineHeight={'22px'}
            maxHeight={'150px'}
            maxLength={-1}
            overflowY={'auto'}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-all'}
            boxShadow={'none !important'}
            color={'myGray.900'}
            onChange={(e) => {
              const textarea = e.target;
              textarea.style.height = textareaMinH;
              textarea.style.height = `${textarea.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              // 触发快捷发送
              if (e.keyCode === 13 && !e.shiftKey) {
                sendPrompt();
                e.preventDefault();
              }
              // 全选内容
              // @ts-ignore
              e.key === 'a' && e.ctrlKey && e.target?.select();
            }}
          />
          {/* 发送和等待按键 */}
          <Flex
            alignItems={'center'}
            justifyContent={'center'}
            h={'25px'}
            w={'25px'}
            position={'absolute'}
            right={['12px', '20px']}
            bottom={'15px'}
          >
            {isChatting ? (
              <MyIcon
                className={styles.stopIcon}
                width={['22px', '25px']}
                height={['22px', '25px']}
                cursor={'pointer'}
                name={'stop'}
                color={'gray.500'}
                onClick={() => controller.current?.abort()}
              />
            ) : (
              <MyIcon
                name={'chatSend'}
                width={['18px', '20px']}
                height={['18px', '20px']}
                cursor={'pointer'}
                color={'gray.500'}
                onClick={sendPrompt}
              />
            )}
          </Flex>
        </Box>
      </Box>
    );
  }, [isChatting, sendPrompt]);

  // abort stream
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      isLeavePage.current = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      controller.current?.abort();
    };
  }, [router.asPath]);

  return {
    ChatBoxParentRef,
    scrollToBottom,
    setChatHistory,
    ChatBox,
    ChatInput
  };
};
