import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { getInitChatSiteInfo, delChatRecordByIndex, postSaveChat } from '@/api/chat';
import type { InitChatResponse } from '@/api/response/chat';
import type { ChatItemType } from '@/types/chat';
import {
  Textarea,
  Box,
  Flex,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  useColorModeValue,
  Menu,
  MenuButton,
  MenuList,
  MenuItem
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useScreen } from '@/hooks/useScreen';
import { useQuery } from '@tanstack/react-query';
import { ModelNameEnum } from '@/constants/model';
import dynamic from 'next/dynamic';
import { useGlobalStore } from '@/store/global';
import { useCopyData } from '@/utils/tools';
import { streamFetch } from '@/api/fetch';
import Icon from '@/components/Icon';
import MyIcon from '@/components/Icon';
import { throttle } from 'lodash';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 5);

const SlideBar = dynamic(() => import('./components/SlideBar'));
const Empty = dynamic(() => import('./components/Empty'));
const Markdown = dynamic(() => import('@/components/Markdown'));

import styles from './index.module.scss';

const textareaMinH = '22px';

export type ChatSiteItemType = {
  id: string;
  status: 'loading' | 'finish';
} & ChatItemType;

interface ChatType extends InitChatResponse {
  history: ChatSiteItemType[];
}

const Chat = ({ modelId, chatId }: { modelId: string; chatId: string }) => {
  const router = useRouter();

  const ChatBox = useRef<HTMLDivElement>(null);
  const TextareaDom = useRef<HTMLTextAreaElement>(null);

  // 中断请求
  const controller = useRef(new AbortController());
  const isResetPage = useRef(false);

  const [chatData, setChatData] = useState<ChatType>({
    chatId,
    modelId,
    name: '',
    avatar: '/icon/logo.png',
    intro: '',
    chatModel: '',
    modelName: '',
    history: []
  }); // 聊天框整体数据

  const [inputVal, setInputVal] = useState(''); // 输入的内容

  const isChatting = useMemo(
    () => chatData.history[chatData.history.length - 1]?.status === 'loading',
    [chatData.history]
  );
  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();

  const { toast } = useToast();
  const { copyData } = useCopyData();
  const { isPc, media } = useScreen();
  const { setLoading } = useGlobalStore();

  // 滚动到底部
  const scrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth') => {
    if (!ChatBox.current) return;
    ChatBox.current.scrollTo({
      top: ChatBox.current.scrollHeight,
      behavior
    });
  }, []);

  // 聊天信息生成中……获取当前滚动条位置，判断是否需要滚动到底部
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const generatingMessage = useCallback(
    throttle(() => {
      if (!ChatBox.current) return;
      const isBottom =
        ChatBox.current.scrollTop + ChatBox.current.clientHeight + 150 >=
        ChatBox.current.scrollHeight;

      isBottom && scrollToBottom('auto');
    }, 100),
    []
  );

  // 重置输入内容
  const resetInputVal = useCallback((val: string) => {
    setInputVal(val);
    setTimeout(() => {
      /* 回到最小高度 */
      if (TextareaDom.current) {
        TextareaDom.current.style.height =
          val === '' ? textareaMinH : `${TextareaDom.current.scrollHeight}px`;
      }
    }, 100);
  }, []);

  // 获取对话信息
  const loadChatInfo = useCallback(
    async ({
      modelId,
      chatId,
      isLoading = false,
      isScroll = false
    }: {
      modelId: string;
      chatId: string;
      isLoading?: boolean;
      isScroll?: boolean;
    }) => {
      isLoading && setLoading(true);
      try {
        const res = await getInitChatSiteInfo(modelId, chatId);

        setChatData({
          ...res,
          history: res.history.map((item: any, i) => ({
            obj: item.obj,
            value: item.value,
            id: item.id || `${nanoid()}-${i}`,
            status: 'finish'
          }))
        });
        if (isScroll && res.history.length > 0) {
          setTimeout(() => {
            scrollToBottom('auto');
          }, 1200);
        }
      } catch (e: any) {
        toast({
          title: e?.message || '获取对话信息异常,请检查地址',
          status: 'error',
          isClosable: true,
          duration: 5000
        });
        router.back();
      }
      setLoading(false);
      return null;
    },
    [router, scrollToBottom, setLoading, toast]
  );

  // 重载新的对话
  const resetChat = useCallback(
    async (modelId = chatData.modelId, chatId = '') => {
      // 强制中断流
      isResetPage.current = true;
      controller.current?.abort();

      try {
        router.replace(`/chat?modelId=${modelId}&chatId=${chatId}`);
        loadChatInfo({
          modelId,
          chatId,
          isLoading: true,
          isScroll: true
        });
      } catch (error: any) {
        toast({
          title: error?.message || '生成新对话失败',
          status: 'warning'
        });
      }
      onCloseSlider();
    },
    [chatData.modelId, loadChatInfo, onCloseSlider, router, toast]
  );

  // gpt 对话
  const gptChatPrompt = useCallback(
    async (prompts: ChatSiteItemType) => {
      const urlMap: Record<string, string> = {
        [ModelNameEnum.GPT35]: '/api/chat/chatGpt',
        [ModelNameEnum.VECTOR_GPT]: '/api/chat/vectorGpt'
      };

      if (!urlMap[chatData.modelName]) return Promise.reject('找不到模型');

      // create abort obj
      const abortSignal = new AbortController();
      controller.current = abortSignal;
      isResetPage.current = false;

      const prompt = {
        obj: prompts.obj,
        value: prompts.value
      };

      // 流请求，获取数据
      const responseText = await streamFetch({
        url: urlMap[chatData.modelName],
        data: {
          prompt,
          chatId,
          modelId
        },
        onMessage: (text: string) => {
          setChatData((state) => ({
            ...state,
            history: state.history.map((item, index) => {
              if (index !== state.history.length - 1) return item;
              return {
                ...item,
                value: item.value + text
              };
            })
          }));
          generatingMessage();
        },
        abortSignal
      });

      // 重置了页面，说明退出了当前聊天, 不缓存任何内容
      if (isResetPage.current) {
        return;
      }

      let newChatId = '';
      // 保存对话信息
      try {
        newChatId = await postSaveChat({
          modelId,
          chatId,
          prompts: [
            prompt,
            {
              obj: 'AI',
              value: responseText
            }
          ]
        });
        if (newChatId) {
          router.replace(`/chat?modelId=${modelId}&chatId=${newChatId}`);
        }
      } catch (err) {
        toast({
          title: '对话出现异常, 继续对话会导致上下文丢失，请刷新页面',
          status: 'warning',
          duration: 3000,
          isClosable: true
        });
      }

      // 设置聊天内容为完成状态
      setChatData((state) => ({
        ...state,
        chatId: newChatId || state.chatId, // 如果有 Id，说明是新创建的对话
        history: state.history.map((item, index) => {
          if (index !== state.history.length - 1) return item;
          return {
            ...item,
            status: 'finish'
          };
        })
      }));
    },
    [chatData.modelName, chatId, generatingMessage, modelId, router, toast]
  );

  /**
   * 发送一个内容
   */
  const sendPrompt = useCallback(async () => {
    if (isChatting) {
      toast({
        title: '正在聊天中...请等待结束',
        status: 'warning'
      });
      return;
    }
    const storeInput = inputVal;
    // 去除空行
    const val = inputVal.trim().replace(/\n\s*/g, '\n');

    if (!val) {
      toast({
        title: '内容为空',
        status: 'warning'
      });
      return;
    }

    const newChatList: ChatSiteItemType[] = [
      ...chatData.history,
      {
        id: nanoid(),
        obj: 'Human',
        value: val,
        status: 'finish'
      },
      {
        id: nanoid(),
        obj: 'AI',
        value: '',
        status: 'loading'
      }
    ];

    // 插入内容
    setChatData((state) => ({
      ...state,
      history: newChatList
    }));

    // 清空输入内容
    resetInputVal('');
    setTimeout(() => {
      scrollToBottom();
    }, 100);

    try {
      await gptChatPrompt(newChatList[newChatList.length - 2]);
    } catch (err: any) {
      toast({
        title: typeof err === 'string' ? err : err?.message || '聊天出错了~',
        status: 'warning',
        duration: 5000,
        isClosable: true
      });

      resetInputVal(storeInput);

      setChatData((state) => ({
        ...state,
        history: newChatList.slice(0, newChatList.length - 2)
      }));
    }
  }, [isChatting, inputVal, chatData.history, resetInputVal, toast, scrollToBottom, gptChatPrompt]);

  // 删除一句话
  const delChatRecord = useCallback(
    async (index: number) => {
      setLoading(true);
      try {
        // 删除数据库最后一句
        await delChatRecordByIndex(chatId, index);

        setChatData((state) => ({
          ...state,
          history: state.history.filter((_, i) => i !== index)
        }));
      } catch (err) {
        console.log(err);
      }
      setLoading(false);
    },
    [chatId, setLoading]
  );

  // 复制内容
  const onclickCopy = useCallback(
    (value: string) => {
      const val = value.replace(/\n+/g, '\n');
      copyData(val);
    },
    [copyData]
  );

  // 初始化聊天框
  useQuery(['init'], () =>
    loadChatInfo({
      modelId,
      chatId,
      isLoading: true,
      isScroll: true
    })
  );

  // 更新流中断对象
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      controller.current?.abort();
    };
  }, []);

  return (
    <Flex
      h={'100%'}
      flexDirection={media('row', 'column')}
      backgroundColor={useColorModeValue('white', '')}
    >
      {isPc ? (
        <Box flex={'0 0 250px'} w={0} h={'100%'}>
          <SlideBar
            resetChat={resetChat}
            chatId={chatId}
            modelId={modelId}
            onClose={onCloseSlider}
          />
        </Box>
      ) : (
        <Box h={'60px'} borderBottom={'1px solid rgba(0,0,0,0.1)'}>
          <Flex
            alignItems={'center'}
            h={'100%'}
            justifyContent={'space-between'}
            backgroundColor={useColorModeValue('white', 'gray.700')}
            color={useColorModeValue('blackAlpha.700', 'white')}
            position={'relative'}
            px={7}
          >
            <Box onClick={onOpenSlider}>
              <Icon
                name={'menu'}
                w={'20px'}
                h={'20px'}
                fill={useColorModeValue('blackAlpha.700', 'white')}
              />
            </Box>
            <Box>{chatData?.name}</Box>
          </Flex>
          <Drawer isOpen={isOpenSlider} placement="left" size={'xs'} onClose={onCloseSlider}>
            <DrawerOverlay backgroundColor={'rgba(255,255,255,0.5)'} />
            <DrawerContent maxWidth={'250px'}>
              <SlideBar
                resetChat={resetChat}
                chatId={chatId}
                modelId={modelId}
                onClose={onCloseSlider}
              />
            </DrawerContent>
          </Drawer>
        </Box>
      )}

      <Flex
        {...media({ h: '100%', w: 0 }, { h: 0, w: '100%' })}
        flex={'1 0 0'}
        flexDirection={'column'}
      >
        {/* 聊天内容 */}
        <Box ref={ChatBox} pb={[4, 0]} flex={'1 0 0'} h={0} w={'100%'} overflowY={'auto'}>
          {chatData.history.map((item, index) => (
            <Box
              key={item.id}
              py={media(9, 6)}
              px={media(4, 2)}
              backgroundColor={
                index % 2 !== 0 ? useColorModeValue('blackAlpha.50', 'gray.700') : ''
              }
              color={useColorModeValue('blackAlpha.700', 'white')}
              borderBottom={'1px solid rgba(0,0,0,0.1)'}
            >
              <Flex maxW={'750px'} m={'auto'} alignItems={'flex-start'}>
                <Menu autoSelect={false}>
                  <MenuButton as={Box} mr={media(4, 1)} cursor={'pointer'}>
                    <Image
                      src={
                        item.obj === 'Human'
                          ? '/icon/human.png'
                          : chatData.avatar || '/icon/logo.png'
                      }
                      alt="avatar"
                      width={media(30, 20)}
                      height={media(30, 20)}
                    />
                  </MenuButton>
                  <MenuList fontSize={'sm'}>
                    <MenuItem onClick={() => onclickCopy(item.value)}>复制</MenuItem>
                    <MenuItem onClick={() => delChatRecord(index)}>删除该行</MenuItem>
                  </MenuList>
                </Menu>
                <Box flex={'1 0 0'} w={0} overflow={'hidden'} id={`chat${index}`}>
                  {item.obj === 'AI' ? (
                    <Markdown
                      source={item.value}
                      isChatting={isChatting && index === chatData.history.length - 1}
                    />
                  ) : (
                    <Box whiteSpace={'pre-wrap'}>{item.value}</Box>
                  )}
                </Box>
                {isPc && (
                  <Flex h={'100%'} flexDirection={'column'} ml={2} w={'14px'} height={'100%'}>
                    <Box minH={'40px'} flex={1}>
                      <MyIcon
                        name="copy"
                        w={'14px'}
                        cursor={'pointer'}
                        color={'alphaBlack.400'}
                        onClick={() => onclickCopy(item.value)}
                      />
                    </Box>
                    <MyIcon
                      name="delete"
                      w={'14px'}
                      cursor={'pointer'}
                      color={'alphaBlack.400'}
                      _hover={{
                        color: 'red.600'
                      }}
                      onClick={() => delChatRecord(index)}
                    />
                  </Flex>
                )}
              </Flex>
            </Box>
          ))}
          {chatData.history.length === 0 && (
            <Empty modelName={chatData.name} intro={chatData.intro} />
          )}
        </Box>
        {/* 发送区 */}
        <Box m={media('20px auto', '0 auto')} w={'100%'} maxW={media('min(750px, 100%)', 'auto')}>
          <Box
            py={'18px'}
            position={'relative'}
            boxShadow={`0 0 15px rgba(0,0,0,0.1)`}
            border={media('1px solid', '0')}
            borderColor={useColorModeValue('gray.200', 'gray.700')}
            borderRadius={['none', 'md']}
            backgroundColor={useColorModeValue('white', 'gray.700')}
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
              value={inputVal}
              rows={1}
              height={'22px'}
              lineHeight={'22px'}
              maxHeight={'150px'}
              maxLength={-1}
              overflowY={'auto'}
              whiteSpace={'pre-wrap'}
              wordBreak={'break-all'}
              color={useColorModeValue('blackAlpha.700', 'white')}
              onChange={(e) => {
                const textarea = e.target;
                setInputVal(textarea.value);
                textarea.style.height = textareaMinH;
                textarea.style.height = `${textarea.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                // 触发快捷发送
                if (isPc && e.keyCode === 13 && !e.shiftKey) {
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
                <Icon
                  className={styles.stopIcon}
                  width={['22px', '25px']}
                  height={['22px', '25px']}
                  cursor={'pointer'}
                  name={'stop'}
                  color={useColorModeValue('gray.500', 'white')}
                  onClick={() => {
                    controller.current?.abort();
                  }}
                />
              ) : (
                <Icon
                  name={'chatSend'}
                  width={['18px', '20px']}
                  height={['18px', '20px']}
                  cursor={'pointer'}
                  color={useColorModeValue('gray.500', 'white')}
                  onClick={sendPrompt}
                />
              )}
            </Flex>
          </Box>
        </Box>
      </Flex>
    </Flex>
  );
};

export default Chat;

export async function getServerSideProps(context: any) {
  const modelId = context?.query?.modelId || '';
  const chatId = context?.query?.chatId || '';

  return {
    props: { modelId, chatId }
  };
}
