import React, { useRef, useEffect, useMemo } from 'react';
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
  useDisclosure,
  useColorMode,
  useColorModeValue
} from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { getToken } from '@/utils/user';
import MyIcon from '@/components/Icon';
import WxConcat from '@/components/WxConcat';
import { getChatHistory, delChatHistoryById } from '@/api/chat';
import { getCollectionModels } from '@/api/model';
import { modelList } from '@/constants/model';

const SlideBar = ({
  chatId,
  modelId,
  resetChat,
  onClose
}: {
  chatId: string;
  modelId: string;
  resetChat: (modelId?: string, chatId?: string) => void;
  onClose: () => void;
}) => {
  const router = useRouter();
  const { colorMode, toggleColorMode } = useColorMode();
  const { myModels, getMyModels } = useUserStore();
  const { isOpen: isOpenWx, onOpen: onOpenWx, onClose: onCloseWx } = useDisclosure();
  const preChatId = useRef('chatId'); // 用于校验上一次chatId的情况,判断是否需要刷新历史记录

  const { isSuccess } = useQuery(['getMyModels'], getMyModels, {
    cacheTime: 5 * 60 * 1000
  });

  const { data: collectionModels = [] } = useQuery([getCollectionModels], getCollectionModels);

  const models = useMemo(() => {
    const myModelList = myModels.map((item) => ({
      id: item._id,
      name: item.name,
      icon: modelList.find((model) => model.model === item?.service?.modelName)?.icon || 'model'
    }));
    const collectionList = collectionModels
      .map((item) => ({
        id: item._id,
        name: item.name,
        icon: 'collectionSolid' as any
      }))
      .filter((model) => !myModelList.find((item) => item.id === model.id));

    return myModelList.concat(collectionList);
  }, [collectionModels, myModels]);

  const { data: chatHistory = [], mutate: loadChatHistory } = useMutation({
    mutationFn: getChatHistory
  });

  // update history
  useEffect(() => {
    if (chatId && preChatId.current === '') {
      loadChatHistory();
    }
    preChatId.current = chatId;
  }, [chatId, loadChatHistory]);

  // init history
  useEffect(() => {
    setTimeout(() => {
      loadChatHistory();
    }, 1000);
  }, [loadChatHistory]);

  const RenderHistory = () => (
    <>
      {chatHistory.map((item) => (
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
          {...(item._id === chatId
            ? {
                borderColor: 'rgba(255,255,255,0.5)',
                backgroundColor: 'rgba(255,255,255,0.1)'
              }
            : {})}
          onClick={() => {
            if (item._id === chatId) return;
            preChatId.current = 'chatId';
            resetChat(item.modelId, item._id);
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
              onClick={async (e) => {
                e.stopPropagation();

                await delChatHistoryById(item._id);
                loadChatHistory();
                if (item._id === chatId) {
                  resetChat();
                }
              }}
            />
          </Box>
        </Flex>
      ))}
    </>
  );

  const RenderButton = ({
    onClick,
    children
  }: {
    onClick: () => void;
    children: JSX.Element | string;
  }) => (
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
          onClick={() => resetChat()}
        >
          新对话
        </Button>
      )}
      {/* 我的模型 & 历史记录 折叠框*/}
      <Box flex={'1 0 0'} px={3} h={0} overflowY={'auto'}>
        {isSuccess && (
          <>
            <Box>
              {models.map((item) => (
                <Flex
                  key={item.id}
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
                  {...(item.id === modelId
                    ? {
                        borderColor: 'rgba(255,255,255,0.5)',
                        backgroundColor: 'rgba(255,255,255,0.1)'
                      }
                    : {})}
                  onClick={async () => {
                    if (item.id === modelId) return;
                    resetChat(item.id);
                    onClose();
                  }}
                >
                  <MyIcon name={item.icon} mr={2} color={'white'} w={'16px'} h={'16px'} />
                  <Box className={'textEllipsis'} flex={'1 0 0'} w={0}>
                    {item.name}
                  </Box>
                </Flex>
              ))}
            </Box>
          </>
        )}
        <Accordion allowToggle>
          <AccordionItem borderTop={0} borderBottom={0}>
            <AccordionButton borderRadius={'md'} pl={1}>
              <Box as="span" flex="1" textAlign="left">
                历史记录
              </Box>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pb={0} px={0}>
              <RenderHistory />
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

      <RenderButton onClick={() => router.push('/number/setting')}>
        <>
          <MyIcon name="pay" fill={'white'} w={'16px'} h={'16px'} mr={4} />
          充值
        </>
      </RenderButton>

      <Flex alignItems={'center'} mr={4}>
        <Box flex={1}>
          <RenderButton onClick={onOpenWx}>交流群</RenderButton>
        </Box>
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
      </Flex>

      {/* wx 联系 */}
      {isOpenWx && <WxConcat onClose={onCloseWx} />}
    </Flex>
  );
};

export default SlideBar;
