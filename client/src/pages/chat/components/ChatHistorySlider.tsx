import React from 'react';
import { AddIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Flex,
  useTheme,
  Menu,
  MenuButton,
  MenuList,
  MenuItem
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@/components/Icon';
import type { ShareChatHistoryItemType, ExportChatType } from '@/types/chat';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import Avatar from '@/components/Avatar';

const ChatHistorySlider = ({
  appName,
  appAvatar,
  history,
  activeHistoryId,
  onChangeChat,
  onDelHistory,
  onCloseSlider
}: {
  appName: string;
  appAvatar: string;
  history: {
    id: string;
    title: string;
  }[];
  activeHistoryId: string;
  onChangeChat: (historyId?: string) => void;
  onDelHistory: (historyId: string) => void;
  onCloseSlider: () => void;
}) => {
  const router = useRouter();
  const theme = useTheme();
  const { isPc } = useGlobalStore();

  return (
    <Flex
      position={'relative'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      bg={'white'}
      px={[2, 5]}
      borderRight={['', theme.borders.base]}
    >
      {isPc && (
        <Flex pt={5} pb={2} alignItems={'center'} whiteSpace={'nowrap'}>
          <Avatar src={appAvatar} />
          <Box ml={2} fontWeight={'bold'} className={'textEllipsis'}>
            {appName}
          </Box>
        </Flex>
      )}
      {/* 新对话 */}
      <Box w={'100%'} h={'36px'} my={5}>
        <Button
          variant={'base'}
          w={'100%'}
          h={'100%'}
          color={'myBlue.700'}
          borderRadius={'xl'}
          leftIcon={<MyIcon name={'edit'} w={'16px'} />}
          overflow={'hidden'}
          onClick={() => onChangeChat()}
        >
          新对话
        </Button>
      </Box>

      {/* chat history */}
      <Box flex={'1 0 0'} h={0} overflow={'overlay'}>
        {history.map((item) => (
          <Flex
            position={'relative'}
            key={item.id}
            alignItems={'center'}
            py={3}
            px={4}
            cursor={'pointer'}
            userSelect={'none'}
            borderRadius={'lg'}
            mb={2}
            _hover={{
              bg: 'myGray.100',
              '& .more': {
                display: 'block'
              }
            }}
            {...(item.id === activeHistoryId
              ? {
                  backgroundColor: 'myBlue.100 !important',
                  color: 'myBlue.700'
                }
              : {
                  onClick: () => {
                    onChangeChat(item.id);
                  }
                })}
          >
            <MyIcon name={item.id === activeHistoryId ? 'chatFill' : 'chatLight'} w={'16px'} />
            <Box flex={'1 0 0'} ml={3} className="textEllipsis">
              {item.title}
            </Box>
            <Box className="more" display={['block', 'none']}>
              <Menu autoSelect={false} isLazy offset={[0, 5]}>
                <MenuButton
                  _hover={{ bg: 'white' }}
                  cursor={'pointer'}
                  borderRadius={'md'}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <MyIcon name={'more'} w={'14px'} p={1} />
                </MenuButton>
                <MenuList color={'myGray.700'} minW={`90px !important`}>
                  <MenuItem>
                    <MyIcon mr={2} name={'setTop'} w={'16px'}></MyIcon>
                    置顶
                  </MenuItem>
                  <MenuItem
                    _hover={{ color: 'red.500' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelHistory(item.id);
                      if (item.id === activeHistoryId) {
                        onChangeChat();
                      }
                    }}
                  >
                    <MyIcon mr={2} name={'delete'} w={'16px'}></MyIcon>
                    删除
                  </MenuItem>
                </MenuList>
              </Menu>
            </Box>
          </Flex>
        ))}
        {history.length === 0 && (
          <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'30vh'}>
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              还没有聊天记录
            </Box>
          </Flex>
        )}
      </Box>
    </Flex>
  );
};

export default ChatHistorySlider;
