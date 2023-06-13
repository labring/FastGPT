import React, { useCallback, useRef, useState, useMemo } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useLoading } from '@/hooks/useLoading';
import { useUserStore } from '@/store/user';
import MyIcon from '@/components/Icon';
import type { HistoryItemType, ExportChatType } from '@/types/chat';
import { useChatStore } from '@/store/chat';
import ModelList from './ModelList';
import { useGlobalStore } from '@/store/global';
import styles from '../index.module.scss';
import { useEditInfo } from '@/hooks/useEditInfo';
import { putChatHistory } from '@/api/chat';
import { useToast } from '@/hooks/useToast';
import { formatTimeToChatTime, getErrText } from '@/utils/tools';

const PcSliderBar = ({
  onclickDelHistory,
  onclickExportChat
}: {
  onclickDelHistory: (historyId: string) => Promise<void>;
  onclickExportChat: (type: ExportChatType) => void;
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const { modelId = '', chatId = '' } = router.query as {
    modelId: string;
    chatId: string;
  };
  const ContextMenuRef = useRef(null);
  const onclickContext = useRef(false);

  const theme = useTheme();
  const { isPc } = useGlobalStore();

  const { Loading, setIsLoading } = useLoading();
  const [contextMenuData, setContextMenuData] = useState<{
    left: number;
    top: number;
    history: HistoryItemType;
  }>();

  const { history, loadHistory } = useChatStore();
  const { myModels, myCollectionModels, loadMyModels } = useUserStore();
  const models = useMemo(
    () => [...myModels, ...myCollectionModels],
    [myCollectionModels, myModels]
  );

  // custom title edit
  const { onOpenModal, EditModal: EditTitleModal } = useEditInfo({
    title: '自定义历史记录标题',
    placeholder: '如果设置为空，会自动跟随聊天记录。'
  });

  // close contextMenu
  useOutsideClick({
    ref: ContextMenuRef,
    handler: () => {
      setTimeout(() => {
        if (contextMenuData && !onclickContext.current) {
          setContextMenuData(undefined);
        }
      }, 10);
      setTimeout(() => {
        onclickContext.current = false;
      }, 10);
    }
  });

  const onclickContextMenu = useCallback(
    (e: MouseEvent<HTMLDivElement>, history: HistoryItemType) => {
      e.preventDefault(); // 阻止默认右键菜单

      if (!isPc) return;

      onclickContext.current = true;
      setContextMenuData({
        left: e.clientX,
        top: e.clientY,
        history
      });
    },
    [isPc]
  );

  useQuery(['loadModels'], () => loadMyModels(false));

  const { isLoading: isLoadingHistory } = useQuery(['loadingHistory'], () =>
    loadHistory({ pageNum: 1 })
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
      {isPc && (
        <Box
          className={styles.newChat}
          zIndex={1001}
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
            onClick={() => router.replace(`/chat?modelId=${modelId}`)}
          >
            新对话
          </Button>
          {models.length > 1 && (
            <Box
              className={styles.modelListContainer}
              position={'absolute'}
              w={'115%'}
              left={0}
              top={'40px'}
              transition={'0.15s ease-out'}
              bg={'white'}
            >
              <Box
                className={styles.modelList}
                mt={'6px'}
                h={'calc(100% - 6px)'}
                overflow={'overlay'}
              >
                <ModelList models={models} modelId={modelId} />
              </Box>
            </Box>
          )}
        </Box>
      )}
      {/* chat history */}
      <Box flex={'1 0 0'} h={0} pl={2} overflowY={'scroll'} userSelect={'none'}>
        {history.map((item) => (
          <Flex
            key={item._id}
            position={'relative'}
            alignItems={'center'}
            p={3}
            borderRadius={'md'}
            mb={[2, 0]}
            cursor={'pointer'}
            transition={'background-color .2s ease-in'}
            _hover={{
              backgroundImage: ['', theme.lgColor.hoverBlueGradient]
            }}
            {...(item._id === chatId
              ? {
                  backgroundImage: `${theme.lgColor.activeBlueGradient}  !important`
                }
              : {
                  bg: item.top ? 'myGray.200' : ''
                })}
            onClick={() => {
              if (item._id === chatId) return;
              if (isPc) {
                router.replace(`/chat?modelId=${item.modelId}&chatId=${item._id}`);
              } else {
                router.push(`/chat?modelId=${item.modelId}&chatId=${item._id}`);
              }
            }}
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
                onClickCapture={async (e) => {
                  e.stopPropagation();
                  setIsLoading(true);
                  try {
                    await onclickDelHistory(item._id);
                  } catch (error) {
                    console.log(error);
                  }
                  setIsLoading(false);
                }}
              />
            )}
          </Flex>
        ))}
        {!isLoadingHistory && history.length === 0 && (
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
                onClick={async () => {
                  try {
                    await putChatHistory({
                      chatId: contextMenuData.history._id,
                      top: !contextMenuData.history.top
                    });
                    loadHistory({ pageNum: 1, init: true });
                  } catch (error) {}
                }}
              >
                {contextMenuData.history.top ? '取消置顶' : '置顶'}
              </MenuItem>
              <MenuItem
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    await onclickDelHistory(contextMenuData.history._id);
                    if (contextMenuData.history._id === chatId) {
                      router.replace(`/chat?modelId=${modelId}`);
                    }
                  } catch (error) {
                    console.log(error);
                  }
                  setIsLoading(false);
                }}
              >
                删除记录
              </MenuItem>
              <MenuItem
                onClick={() =>
                  onOpenModal({
                    defaultVal: contextMenuData.history.title,
                    onSuccess: async (val: string) => {
                      await putChatHistory({
                        chatId: contextMenuData.history._id,
                        customTitle: val,
                        top: contextMenuData.history.top
                      });
                      toast({
                        title: '自定义标题成功',
                        status: 'success'
                      });
                      loadHistory({ pageNum: 1, init: true });
                    },
                    onError(err) {
                      toast({
                        title: getErrText(err),
                        status: 'error'
                      });
                    }
                  })
                }
              >
                自定义标题
              </MenuItem>
              <MenuItem onClick={() => onclickExportChat('html')}>导出HTML格式</MenuItem>
              <MenuItem onClick={() => onclickExportChat('pdf')}>导出PDF格式</MenuItem>
              <MenuItem onClick={() => onclickExportChat('md')}>导出Markdown格式</MenuItem>
            </MenuList>
          </Menu>
        </Box>
      )}
      <EditTitleModal />
      <Loading loading={isLoadingHistory} fixed={false} />
    </Flex>
  );
};

export default PcSliderBar;
