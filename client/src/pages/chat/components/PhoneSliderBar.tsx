import React, { useMemo } from 'react';
import { AddIcon, ChatIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Flex,
  Divider,
  useDisclosure,
  useColorMode,
  useColorModeValue
} from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import MyIcon from '@/components/Icon';
import WxConcat from '@/components/WxConcat';
import { delChatHistoryById } from '@/api/chat';
import { useChatStore } from '@/store/chat';
import Avatar from '@/components/Avatar';

const PhoneSliderBar = ({
  chatId,
  modelId,
  onClose
}: {
  chatId: string;
  modelId: string;
  onClose: () => void;
}) => {
  const router = useRouter();
  const { colorMode, toggleColorMode } = useColorMode();
  const { myModels, myCollectionModels, loadMyModels } = useUserStore();
  const { isOpen: isOpenWx, onOpen: onOpenWx, onClose: onCloseWx } = useDisclosure();

  const models = useMemo(
    () => [...myModels, ...myCollectionModels],
    [myCollectionModels, myModels]
  );
  useQuery(['loadModels'], () => loadMyModels(false));

  const { history, loadHistory } = useChatStore();
  useQuery(['loadingHistory'], () => loadHistory({ pageNum: 1 }));

  const RenderButton = ({
    onClick,
    children
  }: {
    onClick: () => void;
    children: JSX.Element | string;
  }) => (
    <Box px={3} mb={2}>
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
      <Flex alignItems={'center'} justifyContent={'space-between'} px={3}>
        <Box flex={'0 0 50px'}>AI应用</Box>
        {/* 新对话 */}
        <Button
          w={'50%'}
          variant={'outline'}
          colorScheme={'white'}
          mb={2}
          leftIcon={<AddIcon />}
          onClick={() => router.replace(`/chat?modelId=${modelId}`)}
        >
          新对话
        </Button>
      </Flex>
      {/* 我的模型 & 历史记录 折叠框*/}
      <Box flex={'1 0 0'} px={3} h={0} overflowY={'auto'}>
        <Box>
          {models.map((item) => (
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
              {...(item._id === modelId
                ? {
                    borderColor: 'rgba(255,255,255,0.5)',
                    backgroundColor: 'rgba(255,255,255,0.1)'
                  }
                : {})}
              onClick={async () => {
                if (item._id === modelId) return;
                router.replace(`/chat?modelId=${item._id}`);
                onClose();
              }}
            >
              <Avatar src={item.avatar} mr={2} w={'18px'} h={'18px'} />
              <Box className={'textEllipsis'} flex={'1 0 0'} w={0}>
                {item.name}
              </Box>
            </Flex>
          ))}
        </Box>

        <>
          <Box py={1}>历史记录</Box>
          {history.map((item) => (
            <Flex
              key={item._id}
              alignItems={'center'}
              p={3}
              borderRadius={'md'}
              mb={2}
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
                router.replace(`/chat?modelId=${item.modelId}&chatId=${item._id}`);
                onClose();
              }}
            >
              <ChatIcon mr={2} />
              <Box flex={'1 0 0'} w={0} className="textEllipsis">
                {item.title}
              </Box>
              <Box>
                <MyIcon
                  name={'delete'}
                  w={'14px'}
                  onClick={async (e) => {
                    e.stopPropagation();
                    console.log(111);
                    await delChatHistoryById(item._id);
                    loadHistory({ pageNum: 1, init: true });
                    if (item._id === chatId) {
                      router.replace(`/chat?modelId=${modelId}`);
                    }
                  }}
                />
              </Box>
            </Flex>
          ))}
        </>
      </Box>

      <Divider my={3} colorScheme={useColorModeValue('gray', 'white')} />

      <RenderButton onClick={() => router.push('/model')}>
        <>
          <MyIcon name="out" fill={'white'} w={'18px'} h={'18px'} mr={4} />
          退出聊天
        </>
      </RenderButton>
      <RenderButton onClick={onOpenWx}>
        <>
          <MyIcon name="wx" fill={'white'} w={'18px'} h={'18px'} mr={4} />
          交流群
        </>
      </RenderButton>

      {/* wx 联系 */}
      {isOpenWx && <WxConcat onClose={onCloseWx} />}
    </Flex>
  );
};

export default PhoneSliderBar;
