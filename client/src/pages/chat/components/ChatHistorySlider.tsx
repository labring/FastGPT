import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Flex,
  useTheme,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton
} from '@chakra-ui/react';
import { useGlobalStore } from '@/store/global';
import { useRouter } from 'next/router';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import MyIcon from '@/components/Icon';

type HistoryItemType = {
  id: string;
  title: string;
  top?: boolean;
};

const ChatHistorySlider = ({
  appId,
  appName,
  appAvatar,
  history,
  activeHistoryId,
  onChangeChat,
  onDelHistory,
  onSetHistoryTop,
  onUpdateTitle
}: {
  appId?: string;
  appName: string;
  appAvatar: string;
  history: HistoryItemType[];
  activeHistoryId: string;
  onChangeChat: (historyId?: string) => void;
  onDelHistory: (historyId: string) => void;
  onSetHistoryTop?: (e: { historyId: string; top: boolean }) => void;
  onUpdateTitle?: (e: { historyId: string; title: string }) => void;
}) => {
  const theme = useTheme();
  const router = useRouter();
  const { isPc } = useGlobalStore();

  const concatHistory = useMemo<HistoryItemType[]>(
    () => (!activeHistoryId ? [{ id: activeHistoryId, title: '新对话' }].concat(history) : history),
    [activeHistoryId, history]
  );

  return (
    <Flex
      position={'relative'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      bg={'white'}
      borderRight={['', theme.borders.base]}
      whiteSpace={'nowrap'}
    >
      {isPc && (
        <MyTooltip label={appId ? '应用详情' : ''} offset={[0, 0]}>
          <Flex
            pt={5}
            pb={2}
            px={[2, 5]}
            alignItems={'center'}
            cursor={appId ? 'pointer' : 'default'}
            onClick={() =>
              appId &&
              router.push({
                pathname: '/app/detail',
                query: { appId }
              })
            }
          >
            <Avatar src={appAvatar} />
            <Box flex={'1 0 0'} w={0} ml={2} fontWeight={'bold'} className={'textEllipsis'}>
              {appName}
            </Box>
          </Flex>
        </MyTooltip>
      )}
      {/* 新对话 */}
      <Box w={'100%'} px={[2, 5]} h={'36px'} my={5}>
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
      <Box flex={'1 0 0'} h={0} px={[2, 5]} overflow={'overlay'}>
        {concatHistory.map((item) => (
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
            bg={item.top ? '#E6F6F6 !important' : ''}
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
            {!!item.id && (
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
                    {onSetHistoryTop && (
                      <MenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetHistoryTop({ historyId: item.id, top: !item.top });
                        }}
                      >
                        <MyIcon mr={2} name={'setTop'} w={'16px'}></MyIcon>
                        {item.top ? '取消置顶' : '置顶'}
                      </MenuItem>
                    )}
                    {/* {onUpdateTitle && (
                      <MenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateTitle({
                            historyId: item.id,
                            title: '是是是'
                          });
                        }}
                      >
                        <MyIcon mr={2} name={'customTitle'} w={'16px'}></MyIcon>
                        自定义标题
                      </MenuItem>
                    )} */}
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
            )}
          </Flex>
        ))}
      </Box>

      {!isPc && appId && (
        <Flex
          mt={2}
          borderTop={theme.borders.base}
          alignItems={'center'}
          cursor={'pointer'}
          p={3}
          onClick={() => router.push('/app/list')}
        >
          <IconButton
            mr={3}
            icon={<MyIcon name={'backFill'} w={'18px'} color={'myBlue.600'} />}
            bg={'white'}
            boxShadow={'1px 1px 9px rgba(0,0,0,0.15)'}
            h={'28px'}
            size={'sm'}
            borderRadius={'50%'}
            aria-label={''}
          />
          切换应用
        </Flex>
      )}
    </Flex>
  );
};

export default ChatHistorySlider;
