import React, { useCallback, useState, useRef, useMemo, useEffect, MouseEvent } from 'react';
import { useRouter } from 'next/router';
import { initShareChatInfo } from '@/api/chat';
import type { ChatSiteItemType, ExportChatType } from '@/types/chat';
import {
  Textarea,
  Box,
  Flex,
  useColorModeValue,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Image,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  Card,
  Tooltip,
  useOutsideClick,
  useTheme,
  Input,
  ModalFooter,
  ModalHeader
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useGlobalStore } from '@/store/global';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useCopyData, voiceBroadcast, hasVoiceApi } from '@/utils/tools';
import { streamFetch } from '@/api/fetch';
import MyIcon from '@/components/Icon';
import { throttle } from 'lodash';
import { Types } from 'mongoose';
import { LOGO_ICON } from '@/constants/chat';
import { useChatStore } from '@/store/chat';
import { useLoading } from '@/hooks/useLoading';
import { fileDownload } from '@/utils/file';
import { htmlTemplate } from '@/constants/common';
import { useUserStore } from '@/store/user';
import Loading from '@/components/Loading';
import Markdown from '@/components/Markdown';
import SideBar from '@/components/SideBar';
import Empty from './components/Empty';

const ShareHistory = dynamic(() => import('./components/ShareHistory'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});

import styles from './index.module.scss';

const textareaMinH = '22px';

const Chat = ({ shareId, historyId }: { shareId: string; historyId: string }) => {
  const router = useRouter();
  const theme = useTheme();

  const ChatBox = useRef<HTMLDivElement>(null);
  const TextareaDom = useRef<HTMLTextAreaElement>(null);
  const ContextMenuRef = useRef(null);
  const PhoneContextShow = useRef(false);

  // 中断请求
  const controller = useRef(new AbortController());
  const isLeavePage = useRef(false);

  const [inputVal, setInputVal] = useState(''); // user input prompt
  const [showSystemPrompt, setShowSystemPrompt] = useState('');
  const [messageContextMenuData, setMessageContextMenuData] = useState<{
    // message messageContextMenuData
    left: number;
    top: number;
    message: ChatSiteItemType;
  }>();

  const {
    password,
    setPassword,
    shareChatHistory,
    delShareHistoryById,
    setShareChatHistory,
    shareChatData,
    setShareChatData,
    delShareChatHistoryItemById,
    delShareChatHistory
  } = useChatStore();

  const isChatting = useMemo(
    () => shareChatData.history[shareChatData.history.length - 1]?.status === 'loading',
    [shareChatData.history]
  );

  const { toast } = useToast();
  const { copyData } = useCopyData();
  const { isPc } = useGlobalStore();
  const { Loading, setIsLoading } = useLoading();
  const { userInfo } = useUserStore();
  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();
  const {
    isOpen: isOpenPassword,
    onClose: onClosePassword,
    onOpen: onOpenPassword
  } = useDisclosure();

  // close contextMenu
  useOutsideClick({
    ref: ContextMenuRef,
    handler: () => {
      // 移动端长按后会将其设置为true，松手时候也会触发一次，松手的时候需要忽略一次。
      if (PhoneContextShow.current) {
        PhoneContextShow.current = false;
      } else {
        messageContextMenuData &&
          setTimeout(() => {
            setMessageContextMenuData(undefined);
            window.getSelection?.()?.empty?.();
            window.getSelection?.()?.removeAllRanges?.();
            document?.getSelection()?.empty();
          });
      }
    }
  });

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

  // gpt 对话
  const gptChatPrompt = useCallback(
    async (prompts: ChatSiteItemType[]) => {
      // create abort obj
      const abortSignal = new AbortController();
      controller.current = abortSignal;
      isLeavePage.current = false;

      const formatPrompts = prompts.map((item) => ({
        obj: item.obj,
        value: item.value
      }));

      // 流请求，获取数据
      const { responseText, systemPrompt } = await streamFetch({
        url: '/api/chat/shareChat/chat',
        data: {
          prompts: formatPrompts.slice(-shareChatData.maxContext - 1, -1),
          password,
          shareId,
          historyId
        },
        onMessage: (text: string) => {
          setShareChatData((state) => ({
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
      if (isLeavePage.current) {
        return;
      }

      let responseHistory: ChatSiteItemType[] = [];

      // 设置聊天内容为完成状态
      setShareChatData((state) => {
        responseHistory = state.history.map((item, index) => {
          if (index !== state.history.length - 1) return item;
          return {
            ...item,
            status: 'finish',
            systemPrompt
          };
        });

        return {
          ...state,
          history: responseHistory
        };
      });

      setShareChatHistory({
        historyId,
        shareId,
        title: formatPrompts[formatPrompts.length - 2].value,
        latestChat: responseText,
        chats: responseHistory
      });

      setTimeout(() => {
        generatingMessage();
      }, 100);
    },
    [
      generatingMessage,
      historyId,
      password,
      setShareChatData,
      setShareChatHistory,
      shareChatData.maxContext,
      shareId
    ]
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
      ...shareChatData.history,
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
    setShareChatData((state) => ({
      ...state,
      history: newChatList
    }));

    // 清空输入内容
    resetInputVal('');
    setTimeout(() => {
      scrollToBottom();
    }, 100);

    try {
      await gptChatPrompt(newChatList);
    } catch (err: any) {
      toast({
        title: typeof err === 'string' ? err : err?.message || '聊天出错了~',
        status: 'warning',
        duration: 5000,
        isClosable: true
      });

      resetInputVal(storeInput);

      setShareChatData((state) => ({
        ...state,
        history: newChatList.slice(0, newChatList.length - 2)
      }));
    }
  }, [
    isChatting,
    inputVal,
    shareChatData.history,
    setShareChatData,
    resetInputVal,
    toast,
    scrollToBottom,
    gptChatPrompt
  ]);

  // 复制内容
  const onclickCopy = useCallback(
    (value: string) => {
      const val = value.replace(/\n+/g, '\n');
      copyData(val);
    },
    [copyData]
  );

  // export chat data
  const onclickExportChat = useCallback(
    (type: ExportChatType) => {
      const getHistoryHtml = () => {
        const historyDom = document.getElementById('history');
        if (!historyDom) return;
        const dom = Array.from(historyDom.children).map((child, i) => {
          const avatar = `<img src="${
            child.querySelector<HTMLImageElement>('.avatar')?.src
          }" alt="" />`;

          const chatContent = child.querySelector<HTMLDivElement>('.markdown');

          if (!chatContent) {
            return '';
          }

          const chatContentClone = chatContent.cloneNode(true) as HTMLDivElement;

          const codeHeader = chatContentClone.querySelectorAll('.code-header');
          codeHeader.forEach((childElement: any) => {
            childElement.remove();
          });

          return `<div class="chat-item">
          ${avatar}
          ${chatContentClone.outerHTML}
        </div>`;
        });

        const html = htmlTemplate.replace('{{CHAT_CONTENT}}', dom.join('\n'));
        return html;
      };

      const map: Record<ExportChatType, () => void> = {
        md: () => {
          fileDownload({
            text: shareChatData.history.map((item) => item.value).join('\n\n'),
            type: 'text/markdown',
            filename: 'chat.md'
          });
        },
        html: () => {
          const html = getHistoryHtml();
          html &&
            fileDownload({
              text: html,
              type: 'text/html',
              filename: '聊天记录.html'
            });
        },
        pdf: () => {
          const html = getHistoryHtml();

          html &&
            // @ts-ignore
            html2pdf(html, {
              margin: 0,
              filename: `聊天记录.pdf`
            });
        }
      };

      map[type]();
    },
    [shareChatData.history]
  );

  // onclick chat message context
  const onclickContextMenu = useCallback(
    (e: MouseEvent<HTMLDivElement>, message: ChatSiteItemType) => {
      e.preventDefault(); // 阻止默认右键菜单

      // select all text
      const range = document.createRange();
      range.selectNodeContents(e.currentTarget as HTMLDivElement);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);

      navigator.vibrate?.(50); // 震动 50 毫秒

      if (!isPc) {
        PhoneContextShow.current = true;
      }

      setMessageContextMenuData({
        left: e.clientX - 20,
        top: e.clientY,
        message
      });

      return false;
    },
    [isPc]
  );

  // 获取对话信息
  const loadChatInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await initShareChatInfo({
        shareId,
        password
      });

      const history = shareChatHistory.find((item) => item._id === historyId)?.chats || [];

      setShareChatData({
        ...res,
        history
      });

      onClosePassword();

      history.length > 0 &&
        setTimeout(() => {
          scrollToBottom();
        }, 500);
    } catch (e: any) {
      toast({
        status: 'error',
        title: typeof e === 'string' ? e : e?.message || '初始化异常'
      });
      if (e?.code === 501) {
        onOpenPassword();
      } else {
        delShareChatHistory(shareId);
        router.replace(`/chat/share`);
      }
    }
    setIsLoading(false);
    return null;
  }, [
    setIsLoading,
    shareId,
    password,
    setShareChatData,
    shareChatHistory,
    onClosePassword,
    historyId,
    scrollToBottom,
    toast,
    onOpenPassword,
    delShareChatHistory,
    router
  ]);

  // 初始化聊天框
  useQuery(['init', historyId], () => {
    if (!shareId) {
      return null;
    }

    if (!historyId) {
      router.replace(`/chat/share?shareId=${shareId}&historyId=${new Types.ObjectId()}`);
      return null;
    }

    return loadChatInfo();
  });

  // abort stream
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      isLeavePage.current = true;
      controller.current?.abort();
    };
  }, [shareId, historyId]);

  // context menu component
  const RenderContextMenu = useCallback(
    ({ history, index }: { history: ChatSiteItemType; index: number }) => (
      <MenuList fontSize={'sm'} minW={'100px !important'}>
        <MenuItem onClick={() => onclickCopy(history.value)}>复制</MenuItem>
        {hasVoiceApi && (
          <MenuItem
            borderBottom={theme.borders.base}
            onClick={() => voiceBroadcast({ text: history.value })}
          >
            语音播报
          </MenuItem>
        )}

        <MenuItem onClick={() => delShareChatHistoryItemById(historyId, index)}>删除</MenuItem>
      </MenuList>
    ),
    [delShareChatHistoryItemById, historyId, onclickCopy, theme.borders.base]
  );

  return (
    <Flex
      h={'100%'}
      flexDirection={['column', 'row']}
      backgroundColor={useColorModeValue('#fdfdfd', '')}
    >
      {/* pc always show history.  */}
      {isPc && (
        <SideBar>
          <ShareHistory
            onclickDelHistory={delShareHistoryById}
            onclickExportChat={onclickExportChat}
            onCloseSlider={onCloseSlider}
          />
        </SideBar>
      )}

      {/* 聊天内容 */}
      <Flex
        position={'relative'}
        h={[0, '100%']}
        w={['100%', 0]}
        flex={'1 0 0'}
        flexDirection={'column'}
      >
        {/* chat header */}
        <Flex
          alignItems={'center'}
          justifyContent={'space-between'}
          py={[3, 5]}
          px={5}
          borderBottom={'1px solid '}
          borderBottomColor={useColorModeValue('gray.200', 'gray.700')}
          color={useColorModeValue('myGray.900', 'white')}
        >
          {!isPc && (
            <MyIcon
              name={'tabbarMore'}
              w={'14px'}
              h={'14px'}
              color={useColorModeValue('blackAlpha.700', 'white')}
              onClick={onOpenSlider}
            />
          )}
          <Box lineHeight={1.2} textAlign={'center'} px={3} fontSize={['sm', 'md']}>
            {shareChatData.model.name}
            {shareChatData.history.length > 0 ? ` (${shareChatData.history.length})` : ''}
          </Box>
          {shareChatData.history.length > 0 ? (
            <Menu autoSelect={false}>
              <MenuButton lineHeight={1}>
                <MyIcon
                  name={'more'}
                  w={'16px'}
                  h={'16px'}
                  color={useColorModeValue('blackAlpha.700', 'white')}
                />
              </MenuButton>
              <MenuList minW={`90px !important`}>
                <MenuItem onClick={() => router.replace(`/chat/share?shareId=${shareId}`)}>
                  新对话
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    delShareHistoryById(historyId);
                    router.replace(`/chat/share?shareId=${shareId}`);
                  }}
                >
                  删除记录
                </MenuItem>
                <MenuItem onClick={() => onclickExportChat('html')}>导出HTML格式</MenuItem>
                <MenuItem onClick={() => onclickExportChat('pdf')}>导出PDF格式</MenuItem>
                <MenuItem onClick={() => onclickExportChat('md')}>导出Markdown格式</MenuItem>
              </MenuList>
            </Menu>
          ) : (
            <Box w={'16px'} h={'16px'} />
          )}
        </Flex>
        {/* chat content box */}
        <Box ref={ChatBox} pb={[4, 0]} flex={'1 0 0'} h={0} w={'100%'} overflow={'overlay'}>
          <Box id={'history'}>
            {shareChatData.history.map((item, index) => (
              <Flex key={item._id} alignItems={'flex-start'} py={2} px={[2, 6, 8]}>
                {item.obj === 'Human' && <Box flex={1} />}
                {/* avatar */}
                <Menu autoSelect={false} isLazy>
                  <MenuButton
                    as={Box}
                    {...(item.obj === 'AI'
                      ? {
                          order: 1,
                          mr: ['6px', 2]
                        }
                      : {
                          order: 3,
                          ml: ['6px', 2]
                        })}
                  >
                    <Tooltip label={item.obj === 'AI' ? 'AI助手详情' : ''}>
                      <Image
                        className="avatar"
                        src={
                          item.obj === 'Human'
                            ? userInfo?.avatar || '/icon/human.png'
                            : shareChatData.model.avatar || LOGO_ICON
                        }
                        alt="avatar"
                        w={['20px', '34px']}
                        h={['20px', '34px']}
                        borderRadius={'50%'}
                        objectFit={'contain'}
                      />
                    </Tooltip>
                  </MenuButton>
                  {!isPc && <RenderContextMenu history={item} index={index} />}
                </Menu>
                {/* message */}
                <Flex order={2} pt={2} maxW={['calc(100% - 50px)', '80%']}>
                  {item.obj === 'AI' ? (
                    <Box w={'100%'}>
                      <Card
                        bg={'white'}
                        px={4}
                        py={3}
                        borderRadius={'0 8px 8px 8px'}
                        onContextMenu={(e) => onclickContextMenu(e, item)}
                      >
                        <Markdown
                          source={item.value}
                          isChatting={isChatting && index === shareChatData.history.length - 1}
                          formatLink
                        />
                        {item.systemPrompt && (
                          <Button
                            size={'xs'}
                            mt={2}
                            fontWeight={'normal'}
                            colorScheme={'gray'}
                            variant={'outline'}
                            w={'90px'}
                            onClick={() => setShowSystemPrompt(item.systemPrompt || '')}
                          >
                            查看提示词
                          </Button>
                        )}
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
                        onContextMenu={(e) => onclickContextMenu(e, item)}
                      >
                        <Box as={'p'}>{item.value}</Box>
                      </Card>
                    </Box>
                  )}
                </Flex>
              </Flex>
            ))}
            {shareChatData.history.length === 0 && (
              <Empty model={shareChatData.model} showChatProblem={false} />
            )}
          </Box>
        </Box>
        {/* 发送区 */}
        <Box m={['0 auto', '20px auto']} w={'100%'} maxW={['auto', 'min(750px, 100%)']}>
          <Box
            py={'18px'}
            position={'relative'}
            boxShadow={`0 0 10px rgba(0,0,0,0.1)`}
            borderTop={['1px solid', 0]}
            borderTopColor={useColorModeValue('gray.200', 'gray.700')}
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
              boxShadow={'none !important'}
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
                <MyIcon
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
                <MyIcon
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

        <Loading fixed={false} />
      </Flex>

      {/* phone slider */}
      {!isPc && (
        <Drawer isOpen={isOpenSlider} placement="left" size={'xs'} onClose={onCloseSlider}>
          <DrawerOverlay backgroundColor={'rgba(255,255,255,0.5)'} />
          <DrawerContent maxWidth={'250px'}>
            <ShareHistory
              onclickDelHistory={delShareHistoryById}
              onclickExportChat={onclickExportChat}
              onCloseSlider={onCloseSlider}
            />
          </DrawerContent>
        </Drawer>
      )}
      {/* system prompt show modal */}
      {
        <Modal isOpen={!!showSystemPrompt} onClose={() => setShowSystemPrompt('')}>
          <ModalOverlay />
          <ModalContent maxW={'min(90vw, 600px)'} pr={2} maxH={'80vh'} overflowY={'auto'}>
            <ModalCloseButton />
            <ModalBody pt={5} whiteSpace={'pre-wrap'} textAlign={'justify'}>
              {showSystemPrompt}
            </ModalBody>
          </ModalContent>
        </Modal>
      }
      {/* context menu */}
      {messageContextMenuData && (
        <Box
          zIndex={10}
          position={'fixed'}
          top={messageContextMenuData.top}
          left={messageContextMenuData.left}
        >
          <Box ref={ContextMenuRef}></Box>
          <Menu isOpen>
            <RenderContextMenu
              history={messageContextMenuData.message}
              index={shareChatData.history.findIndex(
                (item) => item._id === messageContextMenuData.message._id
              )}
            />
          </Menu>
        </Box>
      )}
      {/* password input */}
      {
        <Modal isOpen={isOpenPassword} onClose={onClosePassword}>
          <ModalOverlay />
          <ModalContent>
            <ModalCloseButton />
            <ModalHeader>安全密码</ModalHeader>
            <ModalBody>
              <Flex alignItems={'center'}>
                <Box flex={'0 0 70px'}>密码：</Box>
                <Input
                  type="password"
                  autoFocus
                  placeholder="使用密码,无密码直接点确认"
                  onBlur={(e) => setPassword(e.target.value)}
                />
              </Flex>
            </ModalBody>
            <ModalFooter>
              <Button variant={'outline'} mr={3} onClick={onClosePassword}>
                取消
              </Button>
              <Button onClick={loadChatInfo}>确定</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      }
    </Flex>
  );
};

Chat.getInitialProps = ({ query, req }: any) => {
  return {
    shareId: query?.shareId || '',
    historyId: query?.historyId || ''
  };
};

export default Chat;
