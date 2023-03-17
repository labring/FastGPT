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
  Divider,
  IconButton
} from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useChatStore } from '@/store/chat';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useScreen } from '@/hooks/useScreen';
import { getToken } from '@/utils/user';
import MyIcon from '@/components/Icon';
import { useCopyData } from '@/utils/tools';

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
  const { copyData } = useCopyData();
  const { myModels, getMyModels } = useUserStore();
  const { chatHistory, removeChatHistoryByWindowId, generateChatWindow, updateChatHistory } =
    useChatStore();
  const { isSuccess } = useQuery(['init'], getMyModels);
  const [hasReady, setHasReady] = useState(false);

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
                e.stopPropagation();
              }}
            />
          </Box>
        </Flex>
      ))}
    </>
  );

  return (
    <Flex
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      py={3}
      backgroundColor={'blackAlpha.800'}
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
                      router.push(`/chat?chatId=${await generateChatWindow(item._id)}`);
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
          </Accordion>
        ) : (
          <>
            <Box mb={4} textAlign={'center'}>
              历史记录
            </Box>
            <RenderHistory />
          </>
        )}
      </Box>

      <Divider my={4} />

      <Box px={3}>
        {/* 分享 */}
        {getToken() && (
          <Flex
            alignItems={'center'}
            p={2}
            cursor={'pointer'}
            borderRadius={'md'}
            _hover={{
              backgroundColor: 'rgba(255,255,255,0.2)'
            }}
            onClick={async () => {
              copyData(
                `${location.origin}/chat?chatId=${await generateChatWindow(modelId)}`,
                '已复制分享链接'
              );
            }}
          >
            <MyIcon name="share" fill={'white'} w={'16px'} h={'16px'} mr={4} />
            分享空白对话
          </Flex>
        )}
        <Flex
          mt={4}
          alignItems={'center'}
          p={2}
          cursor={'pointer'}
          borderRadius={'md'}
          _hover={{
            backgroundColor: 'rgba(255,255,255,0.2)'
          }}
          onClick={async () => {
            copyData(`${location.origin}/chat?chatId=${chatId}`, '已复制分享链接');
          }}
        >
          <MyIcon name="share" fill={'white'} w={'16px'} h={'16px'} mr={4} />
          分享当前对话
        </Flex>
      </Box>
    </Flex>
  );
};

export default SlideBar;
