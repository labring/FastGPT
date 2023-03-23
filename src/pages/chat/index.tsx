import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import {
  getInitChatSiteInfo,
  getChatSiteId,
  postGPT3SendPrompt,
  delLastMessage,
  postSaveChat
} from '@/api/chat';
import type { InitChatResponse } from '@/api/response/chat';
import { ChatSiteItemType } from '@/types/chat';
import {
  Textarea,
  Box,
  Flex,
  Button,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  useColorModeValue
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import Icon from '@/components/Iconfont';
import { useScreen } from '@/hooks/useScreen';
import { useQuery } from '@tanstack/react-query';
import { ChatModelNameEnum } from '@/constants/model';
import dynamic from 'next/dynamic';
import { useGlobalStore } from '@/store/global';
import { useChatStore } from '@/store/chat';
import { streamFetch } from '@/api/fetch';
import SlideBar from './components/SlideBar';
import Empty from './components/Empty';
import { getToken } from '@/utils/user';
import MyIcon from '@/components/Icon';

const Markdown = dynamic(() => import('@/components/Markdown'));

const textareaMinH = '22px';

interface ChatType extends InitChatResponse {
  history: ChatSiteItemType[];
}

const Chat = ({ chatId }: { chatId: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const { isPc, media } = useScreen();
  const { setLoading } = useGlobalStore();
  const [chatData, setChatData] = useState<ChatType>({
    chatId: '',
    modelId: '',
    name: '',
    avatar: '',
    intro: '',
    secret: {},
    chatModel: '',
    history: [],
    isExpiredTime: false
  }); // 聊天框整体数据

  const ChatBox = useRef<HTMLDivElement>(null);
  const TextareaDom = useRef<HTMLTextAreaElement>(null);

  const [inputVal, setInputVal] = useState(''); // 输入的内容
  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();

  const isChatting = useMemo(
    () => chatData.history[chatData.history.length - 1]?.status === 'loading',
    [chatData.history]
  );
  const chatWindowError = useMemo(() => {
    if (chatData.history[chatData.history.length - 1]?.obj === 'Human') {
      return {
        text: '内容出现异常',
        canDelete: true
      };
    }
    if (chatData.isExpiredTime) {
      return {
        text: '聊天框已过期',
        canDelete: false
      };
    }

    return '';
  }, [chatData]);

  const { pushChatHistory } = useChatStore();
  // 中断请求
  const controller = useRef(new AbortController());
  useEffect(() => {
    controller.current = new AbortController();
    return () => {
      console.log('close========');
      // eslint-disable-next-line react-hooks/exhaustive-deps
      controller.current?.abort();
    };
  }, [chatId]);

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
      },
      onSettled() {
        setLoading(false);
      }
    }
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

  // gpt3 方法
  const gpt3ChatPrompt = useCallback(
    async (newChatList: ChatSiteItemType[]) => {
      // 请求内容
      const response = await postGPT3SendPrompt({
        prompt: newChatList,
        chatId: chatId as string
      });

      // 更新 AI 的内容
      setChatData((state) => ({
        ...state,
        history: state.history.map((item, index) => {
          if (index !== state.history.length - 1) return item;
          return {
            ...item,
            status: 'finish',
            value: response
          };
        })
      }));
    },
    [chatId]
  );

  // chatGPT
  const chatGPTPrompt = useCallback(
    async (newChatList: ChatSiteItemType[]) => {
      const prompt = {
        obj: newChatList[newChatList.length - 1].obj,
        value: newChatList[newChatList.length - 1].value
      };
      // 流请求，获取数据
      const res = await streamFetch({
        url: '/api/chat/chatGpt',
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
          title: '存储对话出现异常, 继续对话会导致上下文丢失，请刷新页面',
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
    [chatId, toast]
  );

  /**
   * 发送一个内容
   */
  const sendPrompt = useCallback(async () => {
    const storeInput = inputVal;
    // 去除空行
    const val = inputVal
      .trim()
      .split('\n')
      .filter((val) => val)
      .join('\n\n');
    if (!chatData?.modelId || !val || !ChatBox.current || isChatting) {
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

    const fnMap: { [key: string]: any } = {
      [ChatModelNameEnum.GPT35]: chatGPTPrompt,
      [ChatModelNameEnum.GPT3]: gpt3ChatPrompt
    };

    try {
      /* 对长度进行限制 */
      const maxContext = chatData.secret.contextMaxLen;
      const requestPrompt =
        newChatList.length > maxContext + 1
          ? newChatList.slice(newChatList.length - maxContext - 1, -1)
          : newChatList.slice(0, -1);

      if (typeof fnMap[chatData.chatModel] === 'function') {
        await fnMap[chatData.chatModel](requestPrompt);
      }

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
    chatData.modelId,
    chatData.history,
    chatData.secret.contextMaxLen,
    chatData.chatModel,
    isChatting,
    resetInputVal,
    scrollToBottom,
    chatGPTPrompt,
    gpt3ChatPrompt,
    pushChatHistory,
    chatId,
    toast
  ]);

  // 重新编辑
  const reEdit = useCallback(async () => {
    if (chatData.history[chatData.history.length - 1]?.obj !== 'Human') return;
    // 删除数据库最后一句
    await delLastMessage(chatId);
    const val = chatData.history[chatData.history.length - 1].value;

    resetInputVal(val);

    setChatData((state) => ({
      ...state,
      history: state.history.slice(0, -1)
    }));
  }, [chatData.history, chatId, resetInputVal]);

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
            name={chatData?.name}
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
              <MyIcon
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
                name={chatData?.name}
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
        <Box ref={ChatBox} flex={'1 0 0'} h={0} w={'100%'} overflowY={'auto'}>
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
                <Box mr={media(4, 1)}>
                  <Image
                    src={item.obj === 'Human' ? '/icon/human.png' : '/icon/logo.png'}
                    alt="/icon/logo.png"
                    width={media(30, 20)}
                    height={media(30, 20)}
                  />
                </Box>
                <Box flex={'1 0 0'} w={0} overflow={'hidden'}>
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
          {!!chatWindowError ? (
            <Box textAlign={'center'}>
              <Box color={'red'}>{chatWindowError.text}</Box>
              <Flex py={5} justifyContent={'center'}>
                {getToken() && <Button onClick={resetChat}>重开对话</Button>}

                {chatWindowError.canDelete && (
                  <Button ml={20} colorScheme={'green'} onClick={reEdit}>
                    重新编辑最后一句
                  </Button>
                )}
              </Flex>
            </Box>
          ) : (
            <Box
              py={5}
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
                w={'100%'}
                pr={'45px'}
                py={0}
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
                maxLength={chatData?.secret.contentMaxLen || -1}
                overflowY={'auto'}
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
              <Box position={'absolute'} bottom={5} right={media('20px', '10px')}>
                {isChatting ? (
                  <Image
                    style={{ transform: 'translateY(4px)' }}
                    src={'/icon/chatting.svg'}
                    width={30}
                    height={30}
                    alt={''}
                  />
                ) : (
                  <Box cursor={'pointer'} onClick={sendPrompt}>
                    <Icon
                      name={'icon-fasong'}
                      width={20}
                      height={20}
                      color={useColorModeValue('#718096', 'white')}
                    ></Icon>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Flex>
    </Flex>
  );
};

export default Chat;

export async function getServerSideProps(context: any) {
  const chatId = context.query?.chatId || '';

  return {
    props: { chatId }
  };
}
