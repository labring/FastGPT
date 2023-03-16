import React, { useState, useEffect } from 'react';
import { Box, Button } from '@chakra-ui/react';
import { AddIcon, ChatIcon, EditIcon, DeleteIcon } from '@chakra-ui/icons';
import {
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Flex,
  Input,
  IconButton
} from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useChatStore } from '@/store/chat';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useScreen } from '@/hooks/useScreen';

const SlideBar = ({
  name,
  windowId,
  chatId,
  resetChat,
  onClose
}: {
  resetChat: () => void;
  name?: string;
  windowId?: string;
  chatId: string;
  onClose: () => void;
}) => {
  const router = useRouter();
  const { isPc } = useScreen();
  const { myModels, getMyModels } = useUserStore();
  const { chatHistory, removeChatHistoryByWindowId, generateChatWindow, updateChatHistory } =
    useChatStore();
  const { isSuccess } = useQuery(['init'], getMyModels);
  const [hasReady, setHasReady] = useState(false);
  const [editHistoryId, setEditHistoryId] = useState<string>();

  useEffect(() => {
    setHasReady(true);
  }, []);

  const RenderHistory = () => (
    <>
      {chatHistory.map((item) => (
        <Flex
          key={item.windowId}
          alignItems={'center'}
          p={3}
          borderRadius={'md'}
          mb={2}
          cursor={'pointer'}
          _hover={{
            backgroundColor: 'rgba(255,255,255,0.1)'
          }}
          fontSize={'xs'}
          border={'1px solid transparent'}
          {...(item.chatId === chatId && item.windowId === windowId
            ? {
                borderColor: 'rgba(255,255,255,0.5)',
                backgroundColor: 'rgba(255,255,255,0.1)'
              }
            : {})}
          onClick={() => {
            if (
              (item.chatId === chatId && item.windowId === windowId) ||
              editHistoryId === item.windowId
            )
              return;
            router.push(
              `/chat?chatId=${item.chatId}&windowId=${item.windowId}&timeStamp=${Date.now()}`
            );
            onClose();
          }}
        >
          <ChatIcon mr={2} />
          <Box flex={'1 0 0'} w={0} className="textEllipsis">
            {item.title}
          </Box>
          {/* <Input
            flex={'1 0 0'}
            w={0}
            value={item.title}
            variant={'unstyled'}
            disabled={editHistoryId !== item.windowId}
            opacity={'1 !important'}
            cursor={`${editHistoryId !== item.windowId ? 'pointer' : 'text'} !important`}
            onChange={(e) => {
              updateChatHistory(item.windowId, e.target.value);
            }}
          /> */}
          <Box>
            {/* <IconButton
              icon={<EditIcon />}
              variant={'unstyled'}
              aria-label={'edit'}
              size={'xs'}
              onClick={(e) => {
                console.log(e);
                setEditHistoryId(item.windowId);
              }}
            /> */}
            <IconButton
              icon={<DeleteIcon />}
              variant={'unstyled'}
              aria-label={'edit'}
              size={'xs'}
              onClick={(e) => {
                removeChatHistoryByWindowId(item.windowId);
                e.stopPropagation();
              }}
            />
          </Box>
        </Flex>
      ))}
    </>
  );

  return (
    <Box w={'100%'} h={'100%'} p={3} backgroundColor={'blackAlpha.800'} color={'white'}>
      {/* 新对话 */}
      <Button
        w={'100%'}
        variant={'white'}
        h={'40px'}
        mb={4}
        leftIcon={<AddIcon />}
        onClick={resetChat}
      >
        新对话
      </Button>
      {/* 我的模型 & 历史记录 折叠框*/}
      {isSuccess ? (
        <Accordion defaultIndex={[0]} allowToggle>
          <AccordionItem borderTop={0} borderBottom={0}>
            <AccordionButton borderRadius={'md'} pl={1}>
              <Box as="span" flex="1" textAlign="left">
                历史记录
              </Box>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pb={0} px={0}>
              {hasReady && <RenderHistory />}
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem borderTop={0} borderBottom={0}>
            <AccordionButton borderRadius={'md'} pl={1}>
              <Box as="span" flex="1" textAlign="left">
                其他模型
              </Box>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pb={4} px={0}>
              {myModels.map((item) => (
                <Flex
                  key={item._id}
                  alignItems={'center'}
                  p={3}
                  borderRadius={'md'}
                  mb={2}
                  cursor={'pointer'}
                  _hover={{
                    backgroundColor: 'rgba(255,255,255,0.1)'
                  }}
                  fontSize={'xs'}
                  border={'1px solid transparent'}
                  {...(item.name === name
                    ? {
                        borderColor: 'rgba(255,255,255,0.5)',
                        backgroundColor: 'rgba(255,255,255,0.1)'
                      }
                    : {})}
                  onClick={async () => {
                    if (item.name === name) return;
                    router.push(
                      `/chat?chatId=${await generateChatWindow(item._id)}&timeStamp=${Date.now()}`
                    );
                    onClose();
                  }}
                >
                  <ChatIcon mr={2} />
                  <Box className={'textEllipsis'} flex={'1 0 0'} w={0}>
                    {item.name}
                  </Box>
                </Flex>
              ))}
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      ) : (
        <RenderHistory />
      )}
    </Box>
  );
};

export default SlideBar;
