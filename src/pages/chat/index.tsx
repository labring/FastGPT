import React, { useCallback, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { getInitChatSiteInfo, postGPT3SendPrompt, delLastMessage, postSaveChat } from '@/api/chat';
import { ChatSiteItemType, ChatSiteType } from '@/types/chat';
import { Textarea, Box, Flex, Button } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import Icon from '@/components/Icon';
import { useScreen } from '@/hooks/useScreen';
import { useQuery } from '@tanstack/react-query';
import { OpenAiModelEnum } from '@/constants/model';
import dynamic from 'next/dynamic';
import { useGlobalStore } from '@/store/global';
import { streamFetch } from '@/api/fetch';

const Markdown = dynamic(() => import('@/components/Markdown'));

const textareaMinH = '22px';

const Chat = ({ chatId, windowId }: { chatId: string; windowId?: string }) => {
  const { toast } = useToast();
  const router = useRouter();
  const { isPc, media } = useScreen();
  const ChatBox = useRef<HTMLDivElement>(null);
  const TextareaDom = useRef<HTMLTextAreaElement>(null);

  const [chatSiteData, setChatSiteData] = useState<ChatSiteType>(); // 聊天框整体数据
  const [chatList, setChatList] = useState<ChatSiteItemType[]>([]); // 对话内容
  const [inputVal, setInputVal] = useState(''); // 输入的内容

  const isChatting = useMemo(() => chatList[chatList.length - 1]?.status === 'loading', [chatList]);
  const lastWordHuman = useMemo(() => chatList[chatList.length - 1]?.obj === 'Human', [chatList]);
  const { setLoading } = useGlobalStore();

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
    ['initData'],
    () => {
      setLoading(true);
      return getInitChatSiteInfo(chatId, windowId);
    },
    {
      onSuccess(res) {
        // 可能没有 windowId，给它设置一下
        router.replace(`/chat?chatId=${chatId}&windowId=${res.windowId}`);

        setChatSiteData(res.chatSite);
        setChatList(
          res.history.map((item) => ({
            ...item,
            status: 'finish'
          }))
        );
        scrollToBottom();
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
  const resetChat = useCallback(() => {
    window.open(`/chat?chatId=${chatId}`, '_self');
  }, [chatId]);

  // gpt3 方法
  const gpt3ChatPrompt = useCallback(
    async (newChatList: ChatSiteItemType[]) => {
      // 请求内容
      const response = await postGPT3SendPrompt({
        prompt: newChatList,
        chatId: chatId as string
      });

      // 更新 AI 的内容
      setChatList((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1) return item;
          return {
            ...item,
            status: 'finish',
            value: response
          };
        })
      );
    },
    [chatId]
  );

  // chatGPT
  const chatGPTPrompt = useCallback(
    async (newChatList: ChatSiteItemType[]) => {
      if (!windowId) return;
      const prompt = {
        obj: newChatList[newChatList.length - 1].obj,
        value: newChatList[newChatList.length - 1].value
      };
      // 流请求，获取数据
      const res = await streamFetch({
        url: '/api/chat/chatGpt',
        data: {
          windowId,
          prompt,
          chatId
        },
        onMessage: (text: string) => {
          setChatList((state) =>
            state.map((item, index) => {
              if (index !== state.length - 1) return item;
              return {
                ...item,
                value: item.value + text
              };
            })
          );
        }
      });

      // 保存对话信息
      try {
        await postSaveChat({
          windowId,
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
      setChatList((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1) return item;
          return {
            ...item,
            status: 'finish'
          };
        })
      );
    },
    [chatId, toast, windowId]
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
    if (!chatSiteData?.modelId || !val || !ChatBox.current || isChatting) {
      return;
    }

    const newChatList: ChatSiteItemType[] = [
      ...chatList,
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
    setChatList(newChatList);
    resetInputVal('');
    scrollToBottom();

    const fnMap: { [key: string]: any } = {
      [OpenAiModelEnum.GPT35]: chatGPTPrompt,
      [OpenAiModelEnum.GPT3]: gpt3ChatPrompt
    };

    try {
      /* 对长度进行限制 */
      const maxContext = chatSiteData.secret.contextMaxLen;
      const requestPrompt =
        newChatList.length > maxContext + 2
          ? [newChatList[0], ...newChatList.slice(newChatList.length - maxContext - 1, -1)]
          : newChatList.slice(0, newChatList.length - 1);

      if (typeof fnMap[chatSiteData.chatModel] === 'function') {
        await fnMap[chatSiteData.chatModel](requestPrompt);
      }
    } catch (err: any) {
      toast({
        title: typeof err === 'string' ? err : err?.message || '聊天出错了~',
        status: 'warning',
        duration: 5000,
        isClosable: true
      });

      resetInputVal(storeInput);

      setChatList(newChatList.slice(0, newChatList.length - 2));
    }
  }, [
    chatGPTPrompt,
    chatList,
    chatSiteData,
    gpt3ChatPrompt,
    inputVal,
    isChatting,
    resetInputVal,
    scrollToBottom,
    toast
  ]);

  // 重新编辑
  const reEdit = useCallback(async () => {
    if (chatList[chatList.length - 1]?.obj !== 'Human') return;
    // 删除数据库最后一句
    await delLastMessage(windowId);
    const val = chatList[chatList.length - 1].value;

    resetInputVal(val);

    setChatList(chatList.slice(0, -1));
  }, [chatList, resetInputVal, windowId]);

  return (
    <Flex height={'100%'} flexDirection={'column'}>
      {/* 头部 */}
      <Flex
        px={4}
        h={'50px'}
        alignItems={'center'}
        backgroundColor={'white'}
        boxShadow={'0 5px 10px rgba(0,0,0,0.1)'}
        zIndex={1}
      >
        <Box flex={1}>{chatSiteData?.name}</Box>
        {/* 滚动到底部按键 */}
        {ChatBox.current && ChatBox.current.scrollHeight > 2 * ChatBox.current.clientHeight && (
          <Box mr={10} cursor={'pointer'} onClick={scrollToBottom}>
            <Icon
              name={'icon-xiangxiazhankai-xianxingyuankuang'}
              width={25}
              height={25}
              color={'#718096'}
            ></Icon>
          </Box>
        )}
        {/* 重置按键 */}
        <Button size={'sm'} colorScheme={'gray'} onClick={resetChat}>
          新对话
        </Button>
      </Flex>
      {/* 聊天内容 */}
      <Box ref={ChatBox} flex={'1 0 0'} h={0} w={'100%'} px={0} pb={10} overflowY={'auto'}>
        {chatList.map((item, index) => (
          <Box
            key={index}
            py={media(9, 6)}
            px={media(4, 2)}
            backgroundColor={index % 2 === 0 ? 'rgba(247,247,248,1)' : '#fff'}
            borderBottom={'1px solid rgba(0,0,0,0.1)'}
          >
            <Flex maxW={'800px'} m={'auto'} alignItems={'flex-start'}>
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
                    isChatting={isChatting && index === chatList.length - 1}
                  />
                ) : (
                  <Box whiteSpace={'pre-wrap'}>{item.value}</Box>
                )}
              </Box>
            </Flex>
          </Box>
        ))}
      </Box>
      {/* 空内容提示 */}
      {/* {
        chatList.length === 0 && (
          <>
          <Card>
内容太长
</Card>
          </>
        )
      } */}
      <Box
        m={media('20px auto', '0 auto')}
        w={media('100vw', '100%')}
        maxW={media('800px', 'auto')}
        boxShadow={'0 -14px 30px rgba(255,255,255,0.6)'}
        borderTop={media('none', '1px solid rgba(0,0,0,0.1)')}
      >
        {lastWordHuman ? (
          <Box textAlign={'center'}>
            <Box color={'red'}>对话出现了异常</Box>
            <Flex py={5} justifyContent={'center'}>
              <Button mr={20} onClick={resetChat} colorScheme={'green'}>
                重开对话
              </Button>
              <Button onClick={reEdit}>重新编辑最后一句</Button>
            </Flex>
          </Box>
        ) : (
          <Box
            py={5}
            position={'relative'}
            boxShadow={'base'}
            overflow={'hidden'}
            borderRadius={media('md', 'none')}
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
              maxLength={chatSiteData?.secret.contentMaxLen || -1}
              overflowY={'auto'}
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
                  <Icon name={'icon-fasong'} width={20} height={20} color={'#718096'}></Icon>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Flex>
  );
};

export default Chat;

export async function getServerSideProps(context: any) {
  const chatId = context.query?.chatId || '';
  const windowId = context.query?.windowId || '';

  return {
    props: { chatId, windowId }
  };
}
