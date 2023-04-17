import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { getInitChatSiteInfo, getChatSiteId, delChatRecordByIndex, postSaveChat } from '@/api/chat';
import type { InitChatResponse } from '@/api/response/chat';
import { ChatSiteItemType } from '@/types/chat';
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
import { ChatModelNameEnum } from '@/constants/model';
import dynamic from 'next/dynamic';
import { useGlobalStore } from '@/store/global';
import { useChatStore } from '@/store/chat';
import { useCopyData } from '@/utils/tools';
import { streamFetch } from '@/api/fetch';
import Icon from '@/components/Icon';
import { modelList } from '@/constants/model';

const SlideBar = dynamic(() => import('./components/SlideBar'));
const Empty = dynamic(() => import('./components/Empty'));
const Markdown = dynamic(() => import('@/components/Markdown'));

const textareaMinH = '22px';

interface ChatType extends InitChatResponse {
  history: ChatSiteItemType[];
}

const Chat = ({ chatId }: { chatId: string }) => {
  const ChatBox = useRef<HTMLDivElement>(null);
  const TextareaDom = useRef<HTMLTextAreaElement>(null);

  const { toast } = useToast();
  const router = useRouter();

  // 中断请求
  const controller = useRef(new AbortController());
  const [chatData, setChatData] = useState<ChatType>({
    chatId: '',
    modelId: '',
    name: '',
    avatar: '',
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

  const { copyData } = useCopyData();
  const { isPc, media } = useScreen();
  const { setLoading } = useGlobalStore();
  const { pushChatHistory } = useChatStore();

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      ChatBox.current &&
        ChatBox.current.scrollTo({
          top: ChatBox.current.scrollHeight,
          behavior: 'smooth'
        });
    }, 100);
  }, []);

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

  // 重载对话
  const resetChat = useCallback(async () => {
    if (!chatData) return;
    try {
      router.replace(`/chat?chatId=${await getChatSiteId(chatData.modelId)}`);
    } catch (error: any) {
      toast({
        title: error?.message || '生成新对话失败',
        status: 'warning'
      });
    }
    onCloseSlider();
  }, [chatData, onCloseSlider, router, toast]);

  // gpt 对话
  const gptChatPrompt = useCallback(
    async (prompts: ChatSiteItemType) => {
      const urlMap: Record<string, string> = {
        [ChatModelNameEnum.GPT35]: '/api/chat/chatGpt',
        [ChatModelNameEnum.VECTOR_GPT]: '/api/chat/vectorGpt'
      };

      if (!urlMap[chatData.modelName]) return Promise.reject('找不到模型');

      const prompt = {
        obj: prompts.obj,
        value: prompts.value
      };
      // 流请求，获取数据
      const res = await streamFetch({
        url: urlMap[chatData.modelName],
        data: {
          prompt,
          chatId
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
        },
        abortSignal: controller.current
      });

      // 保存对话信息
      try {
        await postSaveChat({
          chatId,
          prompts: [
            prompt,
            {
              obj: 'AI',
              value: res as string
            }
          ]
        });
      } catch (err) {
        toast({
          title: '对话出现异常, 继续对话会导致上下文丢失，请刷新页面',
          status: 'warning',
          duration: 3000,
          isClosable: true
        });
      }

      // 设置完成状态
      setChatData((state) => ({
        ...state,
        history: state.history.map((item, index) => {
          if (index !== state.history.length - 1) return item;
          return {
            ...item,
            status: 'finish'
          };
        })
      }));
    },
    [chatData.modelName, chatId, toast]
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

    if (!chatData?.modelId || !val) {
      toast({
        title: '内容为空',
        status: 'warning'
      });
      return;
    }

    const newChatList: ChatSiteItemType[] = [
      ...chatData.history,
      {
        obj: 'Human',
        value: val,
        status: 'finish'
      },
      {
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
    scrollToBottom();

    try {
      await gptChatPrompt(newChatList[newChatList.length - 2]);

      // 如果是 Human 第一次发送，插入历史记录
      const humanChat = newChatList.filter((item) => item.obj === 'Human');
      if (humanChat.length === 1) {
        pushChatHistory({
          chatId,
          title: humanChat[0].value
        });
      }
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
  }, [
    inputVal,
    chatData,
    isChatting,
    resetInputVal,
    scrollToBottom,
    toast,
    gptChatPrompt,
    pushChatHistory,
    chatId
  ]);

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
  useQuery(
    ['init', chatId],
    () => {
      setLoading(true);
      return getInitChatSiteInfo(chatId);
    },
    {
      onSuccess(res) {
        setChatData({
          ...res,
          history: res.history.map((item) => ({
            ...item,
            status: 'finish'
          }))
        });
        if (res.history.length > 0) {
          setTimeout(() => {
            scrollToBottom();
          }, 500);
        }
      },
      onError(e: any) {
        toast({
          title: e?.message || '初始化异常,请检查地址',
          status: 'error',
          isClosable: true,
          duration: 5000
        });
        router.push('/model/list');
      },
      onSettled() {
        setLoading(false);
      }
    }
  );

  // 更新流中断对象
  useEffect(() => {
    controller.current = new AbortController();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      controller.current?.abort();
    };
  }, [chatId]);
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
            modelId={chatData.modelId}
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
                modelId={chatData.modelId}
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
              key={index}
              py={media(9, 6)}
              px={media(4, 2)}
              backgroundColor={
                index % 2 !== 0 ? useColorModeValue('blackAlpha.50', 'gray.700') : ''
              }
              color={useColorModeValue('blackAlpha.700', 'white')}
              borderBottom={'1px solid rgba(0,0,0,0.1)'}
            >
              <Flex maxW={'750px'} m={'auto'} alignItems={'flex-start'}>
                <Menu>
                  <MenuButton as={Box} mr={media(4, 1)} cursor={'pointer'}>
                    <Image
                      src={item.obj === 'Human' ? '/icon/human.png' : '/icon/logo.png'}
                      alt="/icon/logo.png"
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
              </Flex>
            </Box>
          ))}
          {chatData.history.length === 0 && <Empty intro={chatData.intro} />}
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
              h={'30px'}
              w={'30px'}
              position={'absolute'}
              right={['12px', '20px']}
              bottom={'15px'}
              onClick={sendPrompt}
            >
              {isChatting ? (
                <Icon
                  style={{ transform: 'translateY(4px)' }}
                  h={'30px'}
                  w={'30px'}
                  name={'chatting'}
                />
              ) : (
                <Icon
                  name={'chatSend'}
                  width={['18px', '20px']}
                  height={['18px', '20px']}
                  cursor={'pointer'}
                  fill={useColorModeValue('#718096', 'white')}
                ></Icon>
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
  const chatId = context?.query?.chatId || 'noid';

  return {
    props: { chatId }
  };
}
