import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { AddIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  useDisclosure,
  VStack
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { ChatFavouriteTagType } from '@fastgpt/global/core/chat/favouriteApp/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFavouriteApps, updateChatSetting, updateFavouriteAppTags } from '@/web/core/chat/api';
import { useForm } from 'react-hook-form';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { ChatFavouriteAppType } from '@fastgpt/global/core/chat/favouriteApp/type';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';

type EditableTagItemProps = {
  tag: ChatFavouriteTagType;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (updated: ChatFavouriteTagType) => Promise<void> | void;
  onCancelNew: (tag: ChatFavouriteTagType) => void;
  onExitEdit: (tag: ChatFavouriteTagType) => void;
  onConfirmDelete: (tag: ChatFavouriteTagType) => void;
  onSaveTagForApp: (tag: ChatFavouriteTagType) => void;
  appCount?: number;
};

const EditableTagItem = React.memo(function EditableTagItem({
  isEditing,
  tag: initialTag,
  onCommit,
  onCancelNew,
  onExitEdit,
  onStartEdit,
  onConfirmDelete,
  onSaveTagForApp,
  appCount
}: EditableTagItemProps) {
  const { t } = useTranslation();

  const [tag, setTag] = useState<ChatFavouriteTagType>(initialTag);
  const [isSelfEditing, setIsSelfEditing] = useState<boolean>(isEditing);
  const inputRef = useRef<HTMLInputElement>(null);

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: t('chat:setting.favourite.categories_modal.delete_confirm', {
      name: initialTag.name
    })
  });

  const handleConfirmDelete = useCallback(() => {
    openConfirm({
      onConfirm: () => {
        onConfirmDelete(tag);
      }
    })();
  }, [openConfirm, onConfirmDelete, tag]);

  const handleFinishEdit = useCallback(async () => {
    // 取消或者复原 tag 的名称
    if (tag.name.trim() === '') {
      if ((initialTag.name || '').trim() === '') {
        onCancelNew(initialTag);
      } else {
        setTag(initialTag);
        setIsSelfEditing(false);
      }
      onExitEdit(initialTag);
      if (inputRef.current) inputRef.current.blur();
      return;
    }
    setIsSelfEditing(false);
    await onCommit(tag);

    if (inputRef.current) inputRef.current.blur();
  }, [tag, onCommit, onCancelNew, onExitEdit, initialTag]);

  useEffect(() => {
    setIsSelfEditing(isEditing);
  }, [isEditing]);

  useEffect(() => {
    if (isSelfEditing) return;
    // sync from props when not editing
    setTag(initialTag);
  }, [initialTag, isSelfEditing]);

  useEffect(() => {
    if (!inputRef.current || !isSelfEditing) return;
    inputRef.current.focus();
  }, [isSelfEditing]);

  return (
    <Flex
      p="1"
      gap="2"
      rounded="sm"
      alignItems="center"
      justifyContent="space-between"
      bg={isSelfEditing ? 'myGray.50' : 'transparent'}
    >
      <Flex alignItems="center" gap="1" fontSize="sm">
        {isSelfEditing ? (
          <Input
            ref={inputRef}
            value={tag.name}
            onBlur={handleFinishEdit}
            onChange={(e) => {
              const nextName = e.target.value;
              setTag({ ...tag, name: nextName });
            }}
            onKeyDown={(e) => {
              if (e.key.toLowerCase() !== 'enter') return;
              handleFinishEdit();
            }}
          />
        ) : (
          <Flex px="1.5" py="0.5" bg="myGray.200" rounded="xs" minW="40px" justifyContent="center">
            {tag.name}
          </Flex>
        )}
        <Box userSelect="none">({appCount ?? 0})</Box>
      </Flex>

      {!isSelfEditing && (
        <Flex id="_ca" flexShrink={0} alignItems="center" opacity={isSelfEditing ? 1 : 0}>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="save tag for app"
            icon={<MyIcon name="common/add2" color="myGray.500" w="14px" />}
            onClick={() => onSaveTagForApp(tag)}
          />

          <IconButton
            size="sm"
            variant="ghost"
            aria-label="edit"
            icon={<MyIcon name="edit" color="myGray.500" w="14px" />}
            onClick={() => {
              onStartEdit();
              setIsSelfEditing(true);
            }}
          />

          <IconButton
            size="sm"
            variant="ghost"
            aria-label="delete"
            icon={<MyIcon name="common/trash" color="myGray.500" w="14px" />}
            onClick={() => handleConfirmDelete()}
          />
        </Flex>
      )}

      <ConfirmModal />
    </Flex>
  );
});

const SaveTagForAppSubPanel = ({
  tag,
  onClose,
  onRefresh
}: {
  tag: ChatFavouriteTagType;
  onClose: () => void;
  onRefresh: () => Promise<any>;
}) => {
  const { t } = useTranslation();

  const { register, watch } = useForm<{ name: string }>({
    defaultValues: {
      name: ''
    }
  });
  const searchAppName = watch('name');
  // search favourite apps for list rendering (only favourites, not all apps)
  const { data: visibleFavourites = [], loading: isSearching } = useRequest2(
    async () => {
      return await getFavouriteApps({ name: searchAppName });
    },
    {
      manual: false,
      throttleWait: 500,
      refreshDeps: [searchAppName]
    }
  );

  // load all favourites for checked state and saving
  const { data: favouriteApps = [] } = useRequest2(
    async () => {
      return await getFavouriteApps({ name: '' });
    },
    {
      manual: false
    }
  );

  const [localAllFavourites, setLocalAllFavourites] = useState<ChatFavouriteAppType[]>([]);

  useEffect(() => {
    setLocalAllFavourites(favouriteApps);
  }, [favouriteApps]);

  const checkedAppIds = useMemo(() => {
    return (localAllFavourites || [])
      .filter((fav) => Array.isArray(fav.favouriteTags) && fav.favouriteTags.includes(tag.id))
      .map((fav) => fav.appId);
  }, [localAllFavourites, tag.id]);

  const isAppChecked = useCallback(
    (appId: string) => {
      const f = (localAllFavourites || []).find((f) => f.appId === appId);
      return Array.isArray(f?.favouriteTags) && f.favouriteTags.includes(tag.id);
    },
    [localAllFavourites, tag.id]
  );

  const toggleAppChecked = useCallback(
    (appId: string) => {
      setLocalAllFavourites((prev) =>
        (prev || []).map((item) => {
          if (item.appId !== appId) return item;
          const tags: string[] = Array.isArray(item.favouriteTags) ? [...item.favouriteTags] : [];
          const idx = tags.indexOf(tag.id);
          if (idx >= 0) {
            tags.splice(idx, 1);
          } else {
            tags.push(tag.id);
          }
          return { ...item, favouriteTags: tags };
        })
      );
    },
    [tag.id]
  );

  // save apps (update tags) via updateFavouriteApps
  const { loading: isSaving, runAsync: saveApps } = useRequest2(
    async () => {
      await updateFavouriteAppTags(
        localAllFavourites.map((item) => ({ id: item._id, tags: item.favouriteTags }))
      );
    },
    {
      manual: true,
      onSuccess: async () => {
        await onRefresh();
        onClose();
      }
    }
  );

  return (
    <Flex py={4} w={['auto', '500px']} flexDir="column" gap="2">
      <Box px="4">
        <Flex
          justifyContent="space-between"
          fontSize="sm"
          borderBottom="sm"
          borderColor="myGray.200"
          pb="2"
        >
          <Flex alignItems="center" gap="3">
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="close"
              icon={<MyIcon name="common/arrowLeft" w="20px" color="myGray.500" />}
              onClick={onClose}
            />

            <Flex alignItems="center" gap="1">
              <Flex bg="myGray.100" rounded="sm" p="0.5" minW="40px" justifyContent="center">
                {tag.name}
              </Flex>
              <Box>({checkedAppIds.length})</Box>
            </Flex>
          </Flex>

          <Flex alignItems="center" gap="2">
            <InputGroup>
              <InputLeftElement h="36px">
                <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
              </InputLeftElement>
              <Input
                placeholder={t('chat:setting.favourite.search_placeholder')}
                {...register('name')}
              />
            </InputGroup>

            <Button
              variant="primary"
              isLoading={isSaving}
              isDisabled={isSearching}
              onClick={() => saveApps()}
            >
              {t('chat:setting.favourite.save_category_for_app_button')}
            </Button>
          </Flex>
        </Flex>
      </Box>

      {visibleFavourites.length > 0 ? (
        <VStack
          w="100%"
          maxH={['70vh', '500px']}
          minH={['50vh', '200px']}
          overflowY="auto"
          spacing={1}
          alignItems="flex-start"
          px="3"
        >
          {visibleFavourites.map((fav: any) => (
            <Flex
              key={fav._id}
              py="2"
              gap={3}
              w="100%"
              alignItems="center"
              color="myGray.700"
              flexShrink="0"
              borderRadius="sm"
              px="1"
              _hover={{ bg: 'myGray.50' }}
              cursor="pointer"
              onClick={() => toggleAppChecked(fav.appId)}
            >
              <Checkbox
                isChecked={isAppChecked(fav.appId)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleAppChecked(fav.appId);
                }}
                size="sm"
              />
              <Flex alignItems="center" gap={2} flex="1" userSelect="none">
                <Avatar src={fav.avatar} borderRadius="sm" w="6" />
                <Box className="textEllipsis" flex="1" pr="1" fontSize="sm">
                  {fav.name || fav.appId}
                </Box>
              </Flex>
            </Flex>
          ))}
        </VStack>
      ) : (
        <Box>
          <EmptyTip text={t('chat:setting.favourite.category.no_data')} />
        </Box>
      )}
    </Flex>
  );
};

type Props = {
  onClose: () => void;
  onRefresh: () => Promise<any>;
};

const TagManageModal = ({ onClose, onRefresh }: Props) => {
  const { t } = useTranslation();

  const refreshChatSetting = useContextSelector(ChatPageContext, (v) => v.refreshChatSetting);

  // get tags from db
  const tags = useContextSelector(ChatPageContext, (v) => v.chatSettings?.favouriteTags || []);
  // local editable tags list
  const [localTags, setLocalTags] = useState<ChatFavouriteTagType[]>(tags);

  // control the editable state
  const [isEditing, setIsEditing] = useState<string[]>([]);

  // update tags
  const { loading: isUpdating, runAsync: updateTags } = useRequest2(
    async (nextTags: ChatFavouriteTagType[]) => {
      await updateChatSetting({ favouriteTags: nextTags });
    },
    {
      manual: true,
      onSuccess: async () => {
        await refreshChatSetting();
        // after successful update, exit all editing states
        setIsEditing([]);
      }
    }
  );

  // handle click new tag button
  const handleClickNewTag = () => {
    const id = getNanoid(8);
    const next = [{ id, name: '' }, ...localTags];
    setLocalTags(next as ChatFavouriteTagType[]);
    setIsEditing((prev) => [...prev, id]);
  };

  // handle commit updated tag to server
  const handleCommitTag = useCallback(
    async (updated: ChatFavouriteTagType) => {
      // compute next tags deterministically and use it for both state and request
      const next = localTags.map((c) => (c.id === updated.id ? updated : c));
      setLocalTags(next);
      setIsEditing((prev) => prev.filter((v) => v !== updated.id));
      await updateTags(next);
    },
    [localTags, updateTags]
  );

  const handleCancelNewTag = useCallback((target: ChatFavouriteTagType) => {
    setLocalTags((prev) => prev.filter((c) => c.id !== target.id));
    setIsEditing((prev) => prev.filter((v) => v !== target.id));
  }, []);

  const handleExitEdit = useCallback((target: ChatFavouriteTagType) => {
    setIsEditing((prev) => prev.filter((v) => v !== target.id));
  }, []);
  // delete tag
  const { loading: isDeleting, runAsync: deleteTag } = useRequest2(
    async (target: ChatFavouriteTagType) => {
      const next = localTags.filter((c) => c.id !== target.id);
      setLocalTags(next);
      await updateTags(next);
    },
    {
      manual: true
    }
  );

  const {
    isOpen: isSaveTagForAppSubPanelOpen,
    onOpen: onOpenSaveTagForAppSubPanel,
    onClose: onCloseSaveTagForAppSubPanel
  } = useDisclosure();

  const [currentSaveTagForApp, setCurrentSaveTagForApp] = useState<ChatFavouriteTagType | null>(
    null
  );

  const handleOpenSaveTagForAppSubPanel = useCallback(
    (tag: ChatFavouriteTagType) => {
      setCurrentSaveTagForApp(tag);
      onOpenSaveTagForAppSubPanel();
    },
    [onOpenSaveTagForAppSubPanel]
  );

  const isLoading = isUpdating || isDeleting || isEditing.length > 0;

  // counts
  const { data: allFavourites = [] } = useRequest2(
    async () => {
      return await getFavouriteApps({ name: '' });
    },
    {
      manual: false,
      refreshDeps: [isSaveTagForAppSubPanelOpen]
    }
  );
  const tagIdToCount = useMemo(() => {
    const map = new Map<string, number>();
    (allFavourites || []).forEach((fav: any) => {
      const tags: string[] = Array.isArray(fav?.favouriteTags) ? fav.favouriteTags : [];
      tags.forEach((tid) => map.set(tid, (map.get(tid) || 0) + 1));
    });
    return map;
  }, [allFavourites]);

  return (
    <>
      <MyModal
        maxW={['90vw', '800px']}
        iconSrc="/imgs/modal/tag.svg"
        title={t('chat:setting.favourite.manage_categories_button')}
        isOpen={true}
        onClose={onClose}
      >
        {isSaveTagForAppSubPanelOpen ? (
          <SaveTagForAppSubPanel
            tag={currentSaveTagForApp as ChatFavouriteTagType}
            onClose={onCloseSaveTagForAppSubPanel}
            onRefresh={onRefresh}
          />
        ) : (
          <Flex py={4} w={['auto', '500px']} flexDir="column">
            <Box px="4">
              <Flex
                pb="2"
                w="full"
                borderBottom="sm"
                alignItems="center"
                borderColor="myGray.200"
                justifyContent="space-between"
              >
                <Flex fontSize="sm" fontWeight="500" alignItems="center" gap={2}>
                  <MyIcon name="menu" color="myGray.700" w="20px" />
                  <Box>
                    {t('chat:setting.favourite.categories_modal.title', {
                      num: localTags.length
                    })}
                  </Box>
                </Flex>

                <Button
                  fontWeight="400"
                  variant="whitePrimary"
                  isDisabled={isLoading}
                  leftIcon={<AddIcon fontSize="xs" />}
                  onClick={handleClickNewTag}
                >
                  {t('common:new_create')}
                </Button>
              </Flex>
            </Box>

            {localTags.length > 0 ? (
              <Flex
                minH={['100px', '200px']}
                maxH="400px"
                overflowY="auto"
                px="4"
                mt="4"
                flexDir="column"
                gap="2"
              >
                <DndDrag<ChatFavouriteTagType>
                  dataList={localTags}
                  renderInnerPlaceholder={false}
                  onDragEndCb={(list) => {
                    setLocalTags(list);
                    updateTags(list);
                  }}
                >
                  {({ provided }) => (
                    <VStack
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      spacing={0}
                      alignItems="stretch"
                    >
                      {localTags.map((tag, index) => (
                        <Draggable key={tag.id} draggableId={tag.id} index={index}>
                          {(provided, snapshot) => (
                            <Box
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              mb="2"
                              borderRadius="sm"
                              _hover={{ bg: 'myGray.50', '#_ca': { opacity: 1 } }}
                            >
                              <Flex alignItems="center">
                                <Box {...provided.dragHandleProps}>
                                  <MyIcon
                                    name={'drag'}
                                    cursor={'pointer'}
                                    p={2}
                                    borderRadius={'md'}
                                    color={'myGray.500'}
                                    _hover={{ bg: 'myGray.50' }}
                                    w={'16px'}
                                  />
                                </Box>
                                <Box flex={1}>
                                  <EditableTagItem
                                    tag={tag}
                                    appCount={tagIdToCount.get(tag.id) || 0}
                                    onCommit={handleCommitTag}
                                    onCancelNew={handleCancelNewTag}
                                    onExitEdit={handleExitEdit}
                                    isEditing={isEditing.includes(tag.id)}
                                    onStartEdit={() => setIsEditing((prev) => [...prev, tag.id])}
                                    onConfirmDelete={(c) => deleteTag(c)}
                                    onSaveTagForApp={handleOpenSaveTagForAppSubPanel}
                                  />
                                </Box>
                              </Flex>
                            </Box>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </VStack>
                  )}
                </DndDrag>
              </Flex>
            ) : (
              <Box>
                <EmptyTip text={t('chat:setting.favourite.tag.no_data')} />
              </Box>
            )}
          </Flex>
        )}
      </MyModal>
    </>
  );
};

export default React.memo(TagManageModal);
