import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import type { MouseEvent } from 'react';
import { AddIcon, EditIcon, CheckIcon, CloseIcon, DeleteIcon } from '@chakra-ui/icons';
import {
  Input,
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
import { updateChatHistoryTitle } from '@/api/chat';
import ModelList from './ModelList';
import { useGlobalStore } from '@/store/global';
import styles from '../index.module.scss';

type UseEditTitleReturnType = {
  editingHistoryId: string | null;
  setEditingHistoryId: React.Dispatch<React.SetStateAction<string | null>>;
  editedTitle: string;
  setEditedTitle: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLInputElement>;
  onEditClick: (id: string, title: string) => void;
  onSaveClick: (chatId: string, modelId: string, editedTitle: string) => Promise<void>;
  onCloseClick: () => void;
};

const useEditTitle = (): UseEditTitleReturnType => {
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState<string>('');

  const inputRef = useRef<HTMLInputElement | null>(null);

  const onEditClick = (id: string, title: string) => {
    setEditingHistoryId(id);
    setEditedTitle(title);
    inputRef.current && inputRef.current.focus();
  };

  const onSaveClick = async (chatId: string, modelId: string, editedTitle: string) => {
    setEditingHistoryId(null);

    await updateChatHistoryTitle({ chatId: chatId, modelId: modelId, newTitle: editedTitle });
  };

  const onCloseClick = () => {
    setEditingHistoryId(null);
  };

  useEffect(() => {
    if (editingHistoryId) {
      inputRef.current && inputRef.current.focus();
    }
  }, [editingHistoryId]);

  return {
    editingHistoryId,
    setEditingHistoryId,
    editedTitle,
    setEditedTitle,
    inputRef,
    onEditClick,
    onSaveClick,
    onCloseClick
  };
};

const PcSliderBar = ({
  onclickDelHistory,
  onclickExportChat
}: {
  onclickDelHistory: (historyId: string) => Promise<void>;
  onclickExportChat: (type: ExportChatType) => void;
}) => {
  // 使用自定义的useEditTitle hook来管理聊天标题的编辑状态
  const {
    editingHistoryId,
    editedTitle,
    setEditedTitle,
    inputRef,
    onEditClick,
    onSaveClick,
    onCloseClick
  } = useEditTitle();

  const router = useRouter();
  const { modelId = '', chatId = '' } = router.query as { modelId: string; chatId: string };
  const theme = useTheme();
  const { isPc } = useGlobalStore();

  const ContextMenuRef = useRef(null);

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
  useQuery(['loadModels'], () => loadMyModels(false));

  // close contextMenu
  useOutsideClick({
    ref: ContextMenuRef,
    handler: () =>
      setTimeout(() => {
        setContextMenuData(undefined);
      })
  });

  const { isLoading: isLoadingHistory } = useQuery(['loadingHistory'], () =>
    loadHistory({ pageNum: 1 })
  );

  const onclickContextMenu = useCallback(
    (e: MouseEvent<HTMLDivElement>, history: HistoryItemType) => {
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
      <Box flex={'1 0 0'} h={0} overflow={'overlay'}>
        {history.map((item) => (
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
            {...(item._id === chatId
              ? {
                  backgroundColor: '#eff0f1',
                  borderLeftColor: 'myBlue.600 !important'
                }
              : {})}
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
                {editingHistoryId === item._id ? (
                  <Input
                    ref={inputRef}
                    value={editedTitle}
                    onChange={(e: { target: { value: React.SetStateAction<string> } }) =>
                      setEditedTitle(e.target.value)
                    }
                    onBlur={onCloseClick}
                    height={'1.5em'}
                    paddingLeft={'0.5'}
                    style={{ width: '65%' }} // 设置输入框宽度为父元素宽度的一半
                  />
                ) : (
                  <Box flex={'1 0 0'} w={0} className="textEllipsis" color={'myGray.1000'}>
                    {item.title}
                  </Box>
                )}

                {/* 编辑状态下显示确认和取消按钮 */}
                {editingHistoryId === item._id ? (
                  <>
                    <Box mx={1}>
                      <CheckIcon
                        onMouseDown={async (event) => {
                          event.preventDefault();
                          setIsLoading(true);
                          try {
                            await onSaveClick(item._id, item.modelId, editedTitle);
                            await loadHistory({ pageNum: 1, init: true });
                          } catch (error) {
                            console.log(error);
                          }
                          setIsLoading(false);
                        }}
                        _hover={{ color: 'blue.500' }}
                        paddingLeft={'1'}
                      />
                    </Box>
                  </>
                ) : null}
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
                onClick={() => {
                  try {
                    onEditClick(contextMenuData.history._id, contextMenuData.history.title);
                  } catch (error) {
                    console.log(error);
                  }
                }}
              >
                编辑标题
              </MenuItem>
              <MenuItem onClick={() => onclickExportChat('html')}>导出HTML格式</MenuItem>
              <MenuItem onClick={() => onclickExportChat('pdf')}>导出PDF格式</MenuItem>
              <MenuItem onClick={() => onclickExportChat('md')}>导出Markdown格式</MenuItem>
            </MenuList>
          </Menu>
        </Box>
      )}

      <Loading loading={isLoadingHistory} fixed={false} />
    </Flex>
  );
};

export default PcSliderBar;
