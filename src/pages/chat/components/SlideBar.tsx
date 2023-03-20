import React, { useState, useEffect } from 'react';
import { AddIcon, ChatIcon, DeleteIcon, MoonIcon, SunIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Flex,
  Divider,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  useColorMode,
  useColorModeValue
} from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useChatStore } from '@/store/chat';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { getToken } from '@/utils/user';
import MyIcon from '@/components/Icon';
import { useCopyData } from '@/utils/tools';
import Markdown from '@/components/Markdown';
import { shareHint } from '@/constants/common';
import { getChatSiteId } from '@/api/chat';

const SlideBar = ({
  name,
  chatId,
  modelId,
  resetChat,
  onClose
}: {
  name?: string;
  chatId: string;
  modelId: string;
  resetChat: () => void;
  onClose: () => void;
}) => {
  const router = useRouter();
  const { colorMode, toggleColorMode } = useColorMode();
  const { copyData } = useCopyData();
  const { myModels, getMyModels } = useUserStore();
  const { chatHistory, removeChatHistoryByWindowId } = useChatStore();
  const [hasReady, setHasReady] = useState(false);
  const { isOpen: isOpenShare, onOpen: onOpenShare, onClose: onCloseShare } = useDisclosure();

  const { isSuccess } = useQuery(['init'], getMyModels, {
    cacheTime: 5 * 60 * 1000
  });

  useEffect(() => {
    setHasReady(true);
  }, []);

  const RenderHistory = () => (
    <>
      {chatHistory.map((item) => (
        <Flex
          key={item.chatId}
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
          {...(item.chatId === chatId
            ? {
                borderColor: 'rgba(255,255,255,0.5)',
                backgroundColor: 'rgba(255,255,255,0.1)'
              }
            : {})}
          onClick={() => {
            if (item.chatId === chatId) return;
            router.push(`/chat?chatId=${item.chatId}`);
            onClose();
          }}
        >
          <ChatIcon mr={2} />
          <Box flex={'1 0 0'} w={0} className="textEllipsis">
            {item.title}
          </Box>
          <Box>
            <IconButton
              icon={<DeleteIcon />}
              variant={'unstyled'}
              aria-label={'edit'}
              size={'xs'}
              onClick={(e) => {
                removeChatHistoryByWindowId(item.chatId);
                if (item.chatId === chatId) {
                  resetChat();
                }
                e.stopPropagation();
              }}
            />
          </Box>
        </Flex>
      ))}
    </>
  );

  const RenderButton = ({ onClick, children }: { onClick: () => void; children: JSX.Element }) => (
    <Box px={3} mb={3}>
      <Flex
        alignItems={'center'}
        p={2}
        cursor={'pointer'}
        borderRadius={'md'}
        _hover={{
          backgroundColor: 'rgba(255,255,255,0.2)'
        }}
        onClick={onClick}
      >
        {children}
      </Flex>
    </Box>
  );

  return (
    <Flex
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      py={3}
      backgroundColor={useColorModeValue('blackAlpha.800', 'blackAlpha.500')}
      color={'white'}
    >
      {/* 新对话 */}
      {getToken() && (
        <Button
          w={'90%'}
          variant={'white'}
          h={'40px'}
          mb={4}
          mx={'auto'}
          leftIcon={<AddIcon />}
          onClick={resetChat}
        >
          新对话
        </Button>
      )}

      {/* 我的模型 & 历史记录 折叠框*/}
      <Box flex={'1 0 0'} px={3} h={0} overflowY={'auto'}>
        <Accordion defaultIndex={[0]} allowToggle allowMultiple>
          {isSuccess && (
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
                      router.push(`/chat?chatId=${await getChatSiteId(item._id)}`);
                      onClose();
                    }}
                  >
                    <MyIcon name="model" mr={2} fill={'white'} w={'16px'} h={'16px'} />
                    <Box className={'textEllipsis'} flex={'1 0 0'} w={0}>
                      {item.name}
                    </Box>
                  </Flex>
                ))}
              </AccordionPanel>
            </AccordionItem>
          )}
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
        </Accordion>
      </Box>

      <Divider my={4} colorScheme={useColorModeValue('gray', 'white')} />

      <RenderButton onClick={() => router.push('/')}>
        <>
          <MyIcon name="home" fill={'white'} w={'18px'} h={'18px'} mr={4} />
          首页
        </>
      </RenderButton>

      <RenderButton onClick={onOpenShare}>
        <>
          <MyIcon name="share" fill={'white'} w={'16px'} h={'16px'} mr={4} />
          分享
        </>
      </RenderButton>

      <Box textAlign={'end'} mr={4}>
        <IconButton
          icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
          aria-label={''}
          variant={'outline'}
          w={'16px'}
          colorScheme={'white'}
          _hover={{
            backgroundColor: 'rgba(255,255,255,0.2)'
          }}
          onClick={toggleColorMode}
        />
      </Box>

      {/* 分享提示modal */}
      <Modal isOpen={isOpenShare} onClose={onCloseShare}>
        <ModalOverlay />
        <ModalContent color={useColorModeValue('blackAlpha.700', 'white')}>
          <ModalHeader>分享对话</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Markdown source={shareHint} />
          </ModalBody>

          <ModalFooter>
            <Button colorScheme="gray" variant={'outline'} mr={3} onClick={onCloseShare}>
              取消
            </Button>
            {getToken() && (
              <Button
                variant="outline"
                mr={3}
                onClick={async () => {
                  copyData(
                    `${location.origin}/chat?chatId=${await getChatSiteId(modelId)}`,
                    '已复制分享链接'
                  );
                  onCloseShare();
                  onClose();
                }}
              >
                分享空白对话
              </Button>
            )}

            <Button
              onClick={() => {
                copyData(`${location.origin}/chat?chatId=${chatId}`, '已复制分享链接');
                onCloseShare();
                onClose();
              }}
            >
              分享当前对话
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
};

export default SlideBar;
