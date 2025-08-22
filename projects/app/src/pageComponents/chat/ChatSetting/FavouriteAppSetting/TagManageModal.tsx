import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
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
import type { ChatTagType } from '@fastgpt/global/core/chat/setting/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFavouriteApps, updateChatSetting, updateFavouriteAppTags } from '@/web/core/chat/api';
import { useForm } from 'react-hook-form';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { ChatFavouriteApp } from '@fastgpt/global/core/chat/favouriteApp/type';

type EditableTagItemProps = {
  tag: ChatTagType;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (updated: ChatTagType) => Promise<void> | void;
  onConfirmDelete: (tag: ChatTagType) => void;
  onSaveTagForApp: (tag: ChatTagType) => void;
};

const EditableTagItem = React.memo(function EditableTagItem({
  isEditing,
  tag: initialTag,
  onCommit,
  onStartEdit,
  onConfirmDelete,
  onSaveTagForApp
}: EditableTagItemProps) {
  const [tag, setTag] = useState<ChatTagType>(initialTag);
  const [isSelfEditing, setIsSelfEditing] = useState<boolean>(isEditing);
  const [isInValid, setIsInValid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFinishEdit = useCallback(async () => {
    if (tag.name.trim() === '') {
      setIsInValid(true);
      return;
    }
    setIsInValid(false);
    setIsSelfEditing(false);
    await onCommit(tag);

    if (inputRef.current) inputRef.current.blur();
  }, [tag, onCommit]);

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
      transition="all 0.2s ease-in-out"
      _hover={{
        bg: 'myGray.50',
        '#_ca': {
          opacity: 1
        }
      }}
    >
      <Flex alignItems="center" gap="1" fontSize="sm">
        {isSelfEditing ? (
          <Input
            ref={inputRef}
            value={tag.name}
            isInvalid={isInValid}
            errorBorderColor="red.400"
            onBlur={handleFinishEdit}
            onChange={(e) => {
              setIsInValid(false);
              const nextName = e.target.value;
              setTag({ ...tag, name: nextName });
            }}
            onKeyDown={(e) => {
              if (e.key.toLowerCase() !== 'enter') return;
              handleFinishEdit();
            }}
          />
        ) : (
          <Box px="1.5" py="0.5" bg="myGray.200" rounded="xs">
            {tag.name}
          </Box>
        )}
        {/* <Box userSelect="none">({category.appIds.length})</Box> */}
      </Flex>

      {!isSelfEditing && (
        <Flex
          id="_ca"
          flexShrink={0}
          alignItems="center"
          opacity={isSelfEditing ? 1 : 0}
          transition="all 0.2s ease-in-out"
        >
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
            onClick={() => onConfirmDelete(tag)}
          />
        </Flex>
      )}
    </Flex>
  );
});

const SaveTagForAppSubPanel = ({
  tag,
  onClose,
  onRefresh
}: {
  tag: ChatTagType;
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

  const [localAllFavourites, setLocalAllFavourites] = useState<ChatFavouriteApp[]>([]);

  useEffect(() => {
    setLocalAllFavourites(favouriteApps);
  }, [favouriteApps]);

  const checkedAppIds = useMemo(() => {
    return (localAllFavourites || [])
      .filter((fav) => Array.isArray(fav.tags) && fav.tags.includes(tag.id))
      .map((fav) => fav.appId);
  }, [localAllFavourites, tag.id]);

  const isAppChecked = useCallback(
    (appId: string) => {
      const f = (localAllFavourites || []).find((f) => f.appId === appId);
      return Array.isArray(f?.tags) && f.tags.includes(tag.id);
    },
    [localAllFavourites, tag.id]
  );

  const toggleAppChecked = useCallback(
    (appId: string) => {
      setLocalAllFavourites((prev) =>
        (prev || []).map((item) => {
          if (item.appId !== appId) return item;
          const tags: string[] = Array.isArray(item.tags) ? [...item.tags] : [];
          const idx = tags.indexOf(tag.id);
          if (idx >= 0) {
            tags.splice(idx, 1);
          } else {
            tags.push(tag.id);
          }
          return { ...item, tags };
        })
      );
    },
    [tag.id]
  );

  // save apps (update tags) via updateFavouriteApps
  const { loading: isSaving, runAsync: saveApps } = useRequest2(
    async () => {
      await updateFavouriteAppTags(
        localAllFavourites.map((item) => ({ id: item._id, tags: item.tags }))
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
              <Box bg="myGray.100" rounded="sm" p="1">
                {tag.name}
              </Box>
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
            gap={2}
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
              <Avatar src={fav.avatar} borderRadius={'md'} w="1.5rem" />
              <Box className="textEllipsis" flex="1" pr="1">
                {fav.name || fav.appId}
              </Box>
            </Flex>
          </Flex>
        ))}
      </VStack>
    </Flex>
  );
};

type Props = {
  onClose: () => void;
  onRefresh: () => Promise<any>;
};

const TagManageModal = ({ onClose, onRefresh }: Props) => {
  const { t } = useTranslation();

  const refreshChatSetting = useContextSelector(ChatSettingContext, (v) => v.refreshChatSetting);

  // get tags from db
  const tags = useContextSelector(ChatSettingContext, (v) => v.chatSettings?.tags || []);
  // local editable tags list
  const [localTags, setLocalTags] = useState<ChatTagType[]>([]);
  // control the editable state
  const [isEditing, setIsEditing] = useState<string[]>([]);
  // delete confirm modal target
  const [currentDelTag, setCurrentDelTag] = useState<ChatTagType | null>(null);
  // sync local tags from server state when modal opens or data refreshes
  useEffect(() => {
    setLocalTags(tags as ChatTagType[]);
  }, [tags]);
  // update tags
  const { loading: isUpdating, runAsync: updateTags } = useRequest2(
    async (nextTags: ChatTagType[]) => {
      await updateChatSetting({ tags: nextTags });
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
    setLocalTags(next as ChatTagType[]);
    setIsEditing((prev) => [...prev, id]);

    // TODO: persist immediately so new tag will be visible after refresh
    // updateTags(next);
  };
  // handle commit updated tag to server
  const handleCommitTag = useCallback(
    async (updated: ChatTagType) => {
      // compute next tags deterministically and use it for both state and request
      const next = localTags.map((c) => (c.id === updated.id ? updated : c));
      setLocalTags(next);
      setIsEditing((prev) => prev.filter((v) => v !== updated.id));
      await updateTags(next);
    },
    [localTags, updateTags]
  );
  // delete tag
  const { loading: isDeleting, runAsync: deleteTag } = useRequest2(
    async (target: ChatTagType) => {
      const next = localTags.filter((c) => c.id !== target.id);
      setLocalTags(next);
      await updateTags(next);
    },
    {
      manual: true,
      onFinally: () => {
        // reset delete tag after deletion
        setCurrentDelTag(null);
      }
    }
  );
  const {
    isOpen: isSaveTagForAppSubPanelOpen,
    onOpen: onOpenSaveTagForAppSubPanel,
    onClose: onCloseSaveTagForAppSubPanel
  } = useDisclosure();

  const [currentSaveTagForApp, setCurrentSaveTagForApp] = useState<ChatTagType | null>(null);

  const handleOpenSaveTagForAppSubPanel = useCallback(
    (tag: ChatTagType) => {
      setCurrentSaveTagForApp(tag);
      onOpenSaveTagForAppSubPanel();
    },
    [onOpenSaveTagForAppSubPanel]
  );

  const isLoading = isUpdating || isDeleting || isEditing.length > 0;

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
            tag={currentSaveTagForApp as ChatTagType}
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

            <Flex
              minH={['100px', '200px']}
              maxH="400px"
              overflowY="auto"
              px="4"
              mt="4"
              flexDir="column"
              gap="2"
            >
              {localTags.map((tag) => (
                <Box
                  key={tag.id}
                  pb="2"
                  _notLast={{
                    borderBottom: 'sm',
                    borderColor: 'myGray.200'
                  }}
                >
                  <EditableTagItem
                    tag={tag}
                    onCommit={handleCommitTag}
                    isEditing={isEditing.includes(tag.id)}
                    onStartEdit={() => setIsEditing((prev) => [...prev, tag.id])}
                    onConfirmDelete={(c) => setCurrentDelTag(c)}
                    onSaveTagForApp={handleOpenSaveTagForAppSubPanel}
                  />
                </Box>
              ))}
            </Flex>
          </Flex>
        )}
      </MyModal>

      <MyModal
        isOpen={!!currentDelTag}
        iconSrc="/imgs/modal/warn.svg"
        title={t('chat:setting.favourite.categories_modal.delete_confirm_title')}
        onClose={() => setCurrentDelTag(null)}
      >
        <Flex p={4} w={['auto', '420px']} flexDir="column" gap={4}>
          <Box color={'myGray.900'} fontSize={'sm'}>
            {t('chat:setting.favourite.categories_modal.delete_confirm', {
              name: currentDelTag?.name
            })}
          </Box>

          <Flex justifyContent="flex-end" gap={3}>
            <Button variant="whitePrimary" onClick={() => setCurrentDelTag(null)}>
              {t('chat:setting.favourite.categories_modal.delete_cancel_button')}
            </Button>

            <Button
              variant="dangerFill"
              isLoading={isDeleting}
              onClick={() => deleteTag(currentDelTag as ChatTagType)}
            >
              {t('chat:setting.favourite.categories_modal.delete_confirm_button')}
            </Button>
          </Flex>
        </Flex>
      </MyModal>
    </>
  );
};

export default React.memo(TagManageModal);
