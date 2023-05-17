import React, { useCallback, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { AddIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Flex,
  useTheme,
  Menu,
  MenuList,
  MenuItem,
  useOutsideClick
} from '@chakra-ui/react';
import { ChatIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/router';
import { formatTimeToChatTime } from '@/utils/tools';
import MyIcon from '@/components/Icon';
import type { ShareChatHistoryItemType, ExportChatType } from '@/types/chat';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';

import styles from '../index.module.scss';

const PcSliderBar = ({
  onclickDelHistory,
  onclickExportChat,
  onCloseSlider
}: {
  onclickDelHistory: (historyId: string) => void;
  onclickExportChat: (type: ExportChatType) => void;
  onCloseSlider: () => void;
}) => {
  const router = useRouter();
  const { shareId = '', historyId = '' } = router.query as { shareId: string; historyId: string };
  const theme = useTheme();
  const { isPc } = useGlobalStore();

  const ContextMenuRef = useRef(null);

  const [contextMenuData, setContextMenuData] = useState<{
    left: number;
    top: number;
    history: ShareChatHistoryItemType;
  }>();

  const { shareChatHistory } = useChatStore();

  // close contextMenu
  useOutsideClick({
    ref: ContextMenuRef,
    handler: () =>
      setTimeout(() => {
        setContextMenuData(undefined);
      })
  });

  const onclickContextMenu = useCallback(
    (e: MouseEvent<HTMLDivElement>, history: ShareChatHistoryItemType) => {
      e.preventDefault(); // 阻止默认右键菜单

      if (!isPc) return;

      setContextMenuData({
        left: e.clientX + 15,
        top: e.clientY + 10,
        history
      });
    },
    [isPc]
  );

  const replaceChatPage = useCallback(
    ({ hId = '', shareId }: { hId?: string; shareId: string }) => {
      if (hId === historyId) return;

      router.replace(`/chat/share?shareId=${shareId}&historyId=${hId}`);
      !isPc && onCloseSlider();
    },
    [historyId, isPc, onCloseSlider, router]
  );

  return (
    <Flex
      position={'relative'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      bg={'white'}
      borderRight={['', theme.borders.base]}
    >
      {/* 新对话 */}
      <Box
        className={styles.newChat}
        zIndex={1000}
        w={'90%'}
        h={'40px'}
        my={5}
        mx={'auto'}
        position={'relative'}
      >
        <Button
          variant={'base'}
          w={'100%'}
          h={'100%'}
          leftIcon={<AddIcon />}
          onClick={() => replaceChatPage({ shareId })}
        >
          新对话
        </Button>
      </Box>

      {/* chat history */}
      <Box flex={'1 0 0'} h={0} overflow={'overlay'}>
        {shareChatHistory.map((item) => (
          <Flex
            position={'relative'}
            key={item._id}
            alignItems={'center'}
            py={3}
            pr={[0, 3]}
            pl={[6, 3]}
            cursor={'pointer'}
            transition={'background-color .2s ease-in'}
            borderLeft={['none', '5px solid transparent']}
            userSelect={'none'}
            _hover={{
              backgroundColor: ['', '#dee0e3']
            }}
            {...(item._id === historyId
              ? {
                  backgroundColor: '#eff0f1',
                  borderLeftColor: 'myBlue.600 !important'
                }
              : {})}
            onClick={() => replaceChatPage({ hId: item._id, shareId: item.shareId })}
            onContextMenu={(e) => onclickContextMenu(e, item)}
          >
            <ChatIcon fontSize={'16px'} color={'myGray.500'} />
            <Box flex={'1 0 0'} w={0} ml={3}>
              <Flex alignItems={'center'}>
                <Box flex={'1 0 0'} w={0} className="textEllipsis" color={'myGray.1000'}>
                  {item.title}
                </Box>
                <Box color={'myGray.400'} fontSize={'sm'}>
                  {formatTimeToChatTime(item.updateTime)}
                </Box>
              </Flex>
              <Box className="textEllipsis" mt={1} fontSize={'sm'} color={'myGray.500'}>
                {item.latestChat || '……'}
              </Box>
            </Box>
            {/* phone quick delete */}
            {!isPc && (
              <MyIcon
                px={3}
                name={'delete'}
                w={'16px'}
                onClickCapture={(e) => {
                  e.stopPropagation();
                  onclickDelHistory(item._id);
                  item._id === historyId && replaceChatPage({ shareId: item.shareId });
                }}
              />
            )}
          </Flex>
        ))}
        {shareChatHistory.length === 0 && (
          <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} pt={'30vh'}>
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              还没有聊天记录
            </Box>
          </Flex>
        )}
      </Box>
      {/* context menu */}
      {contextMenuData && (
        <Box zIndex={10} position={'fixed'} top={contextMenuData.top} left={contextMenuData.left}>
          <Box ref={ContextMenuRef}></Box>
          <Menu isOpen>
            <MenuList>
              <MenuItem
                onClick={() => {
                  onclickDelHistory(contextMenuData.history._id);
                  contextMenuData.history._id === historyId && replaceChatPage({ shareId });
                }}
              >
                删除记录
              </MenuItem>
              <MenuItem onClick={() => onclickExportChat('html')}>导出HTML格式</MenuItem>
              <MenuItem onClick={() => onclickExportChat('pdf')}>导出PDF格式</MenuItem>
              <MenuItem onClick={() => onclickExportChat('md')}>导出Markdown格式</MenuItem>
            </MenuList>
          </Menu>
        </Box>
      )}
    </Flex>
  );
};

export default PcSliderBar;
