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
import { useChatStore } from '@/store/chat';
import { useLoading } from '@/hooks/useLoading';
import { fileDownload } from '@/utils/file';
import { htmlTemplate } from '@/constants/common';
import { useUserStore } from '@/store/user';
import Loading from '@/components/Loading';
import Markdown from '@/components/Markdown';
import SideBar from '@/components/SideBar';
import Avatar from '@/components/Avatar';
import Empty from './components/Empty';
import { HUMAN_ICON } from '@/constants/chat';
import MyTooltip from '@/components/MyTooltip';

const ShareHistory = dynamic(() => import('./components/ShareHistory'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});

import styles from './index.module.scss';
import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { useChat } from '@/hooks/useChat';

const textareaMinH = '22px';

const Chat = () => {
  const router = useRouter();
  const { shareId = '', historyId } = router.query as { shareId: string; historyId: string };
  const theme = useTheme();

  const ContextMenuRef = useRef(null);
  const PhoneContextShow = useRef(false);

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

  const { ChatBox, ChatInput, ChatBoxParentRef, setChatHistory, scrollToBottom } = useChat({
    appId: shareChatData.appId
  });

  const { toast } = useToast();
  const { copyData } = useCopyData();
  const { isPc } = useGlobalStore();
  const { Loading, setIsLoading } = useLoading();
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
  useQuery(['init', shareId, historyId], () => {
    if (!shareId) {
      return null;
    }

    if (!historyId) {
      return router.replace(`/chat/share?shareId=${shareId}&historyId=${new Types.ObjectId()}`);
    }

    return loadChatInfo();
  });

  return (
    <Flex h={'100%'} flexDirection={['column', 'row']} backgroundColor={'#fdfdfd'}>
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
              name={'menu'}
              w={'20px'}
              h={'20px'}
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
        <Box ref={ChatBoxParentRef} flex={1}>
          <ChatBox appAvatar={shareChatData.model.avatar} />
        </Box>
        {/* 发送区 */}
        <ChatInput />

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
              <Button variant={'base'} mr={3} onClick={onClosePassword}>
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

export default Chat;
