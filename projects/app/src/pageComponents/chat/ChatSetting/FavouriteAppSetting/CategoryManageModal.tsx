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
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { Category } from '@fastgpt/global/core/chat/setting/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFavouriteApps, updateChatSetting, updateAllFavouriteApp } from '@/web/core/chat/api';
import { useForm } from 'react-hook-form';
import Avatar from '@fastgpt/web/components/common/Avatar';

type EditableCategoryItemProps = {
  category: Category;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (updated: Category) => Promise<void> | void;
  onConfirmDelete: (category: Category) => void;
  onSaveCategoryForApp: (category: Category) => void;
};

const EditableCategoryItem = React.memo(function EditableCategoryItem({
  isEditing,
  category: initialCategory,
  onCommit,
  onStartEdit,
  onConfirmDelete,
  onSaveCategoryForApp
}: EditableCategoryItemProps) {
  const [category, setCategory] = useState<Category>(initialCategory);
  const [isSelfEditing, setIsSelfEditing] = useState<boolean>(isEditing);
  const [isInValid, setIsInValid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFinishEdit = useCallback(async () => {
    if (category.name.trim() === '') {
      setIsInValid(true);
      return;
    }
    setIsInValid(false);
    setIsSelfEditing(false);
    await onCommit(category);

    if (inputRef.current) inputRef.current.blur();
  }, [category, onCommit]);

  useEffect(() => {
    setIsSelfEditing(isEditing);
  }, [isEditing]);

  useEffect(() => {
    if (isSelfEditing) return;
    // sync from props when not editing
    setCategory(initialCategory);
  }, [initialCategory, isSelfEditing]);

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
            value={category.name}
            isInvalid={isInValid}
            errorBorderColor="red.400"
            onBlur={handleFinishEdit}
            onChange={(e) => {
              setIsInValid(false);
              const nextName = e.target.value;
              setCategory({ ...category, name: nextName });
            }}
            onKeyDown={(e) => {
              if (e.key.toLowerCase() !== 'enter') return;
              handleFinishEdit();
            }}
          />
        ) : (
          <Box px="1.5" py="0.5" bg="myGray.200" rounded="xs">
            {category.name}
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
            aria-label="save category for app"
            icon={<MyIcon name="common/add2" color="myGray.500" w="14px" />}
            onClick={() => onSaveCategoryForApp(category)}
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
            onClick={() => onConfirmDelete(category)}
          />
        </Flex>
      )}
    </Flex>
  );
});

const SaveCategoryForAppSubPanel = ({
  category,
  onClose,
  onRefresh
}: {
  category: Category;
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

  const [localAllFavourites, setLocalAllFavourites] = React.useState<any[]>([]);

  React.useEffect(() => {
    setLocalAllFavourites(favouriteApps as any[]);
  }, [favouriteApps]);

  const checkedAppIds = React.useMemo(() => {
    return (localAllFavourites || [])
      .filter((fav: any) => Array.isArray(fav.categories) && fav.categories.includes(category.id))
      .map((fav: any) => fav.appId);
  }, [localAllFavourites, category.id]);

  const isAppChecked = React.useCallback(
    (appId: string) => {
      const f = (localAllFavourites || []).find((v: any) => v.appId === appId);
      return Array.isArray(f?.categories) && f.categories.includes(category.id);
    },
    [localAllFavourites, category.id]
  );

  const toggleAppChecked = React.useCallback(
    (appId: string) => {
      setLocalAllFavourites((prev) =>
        (prev || []).map((item: any) => {
          if (item.appId !== appId) return item;
          const categories: string[] = Array.isArray(item.categories) ? [...item.categories] : [];
          const idx = categories.indexOf(category.id);
          if (idx >= 0) {
            categories.splice(idx, 1);
          } else {
            categories.push(category.id);
          }
          return { ...item, categories };
        })
      );
    },
    [category.id]
  );

  // save all favourites (update categories) via updateAll
  const { loading: isSaving, runAsync: saveAllFavourites } = useRequest2(
    async () => {
      await updateAllFavouriteApp(
        (localAllFavourites || []).map((item: any, idx: number) => ({
          appId: item.appId,
          description: item.description,
          categories: item.categories || [],
          order: item.order ?? idx
        }))
      );
      await onRefresh();
      onClose();
    },
    { manual: true }
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
                {category.name}
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
              onClick={() => saveAllFavourites()}
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
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<any>;
};

const CategoryManageModal = ({ isOpen, onClose, onRefresh }: Props) => {
  const { t } = useTranslation();

  const refreshChatSetting = useContextSelector(ChatSettingContext, (v) => v.refreshChatSetting);

  // get categories from db
  const categories = useContextSelector(
    ChatSettingContext,
    (v) => v.chatSettings?.categories || []
  );
  // local editable categories list
  const [localCategories, setLocalCategories] = useState<Category[]>([]);
  // control the editable state
  const [isEditing, setIsEditing] = useState<string[]>([]);
  // delete confirm modal target
  const [currentDelCategory, setCurrentDelCategory] = useState<Category | null>(null);
  // sync local categories from server state when modal opens or data refreshes
  useEffect(() => {
    setLocalCategories(categories as Category[]);
  }, [categories, isOpen]);
  // update categories
  const { loading: isUpdating, runAsync: updateCategories } = useRequest2(
    async (nextCategories: Category[]) => {
      await updateChatSetting({ categories: nextCategories });
      await refreshChatSetting();
    },
    {
      manual: true,
      onSuccess: () => {
        // after successful update, exit all editing states
        setIsEditing([]);
      }
    }
  );
  // handle click new category button
  const handleClickNewCategory = () => {
    const id = getNanoid(8);
    const next = [{ id, name: '' }, ...localCategories];
    setLocalCategories(next as Category[]);
    setIsEditing((prev) => [...prev, id]);

    // TODO: persist immediately so new category will be visible after refresh
    // updateCategories(next);
  };
  // handle commit updated category to server
  const handleCommitCategory = useCallback(
    async (updated: Category) => {
      // compute next categories deterministically and use it for both state and request
      const next = localCategories.map((c) => (c.id === updated.id ? updated : c));
      setLocalCategories(next);
      setIsEditing((prev) => prev.filter((v) => v !== updated.id));
      await updateCategories(next);
    },
    [localCategories, updateCategories]
  );
  // delete category
  const { loading: isDeleting, runAsync: deleteCategory } = useRequest2(
    async (target: Category) => {
      const next = localCategories.filter((c) => c.id !== target.id);
      setLocalCategories(next);
      await updateCategories(next);
    },
    {
      manual: true,
      onFinally: () => {
        // reset delete category after deletion
        setCurrentDelCategory(null);
      }
    }
  );
  const {
    isOpen: isSaveCategoryForAppSubPanelOpen,
    onOpen: onOpenSaveCategoryForAppSubPanel,
    onClose: onCloseSaveCategoryForAppSubPanel
  } = useDisclosure();

  const [currentSaveCategoryForApp, setCurrentSaveCategoryForApp] = useState<Category | null>(null);

  const handleClose = useCallback(() => {
    setIsEditing([]);
    setLocalCategories(categories as Category[]);
    // reset sub states when modal closes
    setCurrentDelCategory(null);
    setCurrentSaveCategoryForApp(null);
    onCloseSaveCategoryForAppSubPanel();
    onClose();
  }, [categories, onClose, onCloseSaveCategoryForAppSubPanel]);

  const handleOpenSaveCategoryForAppSubPanel = useCallback(
    (category: Category) => {
      setCurrentSaveCategoryForApp(category);
      onOpenSaveCategoryForAppSubPanel();
    },
    [onOpenSaveCategoryForAppSubPanel]
  );

  const handleCloseSaveCategoryForAppSubPanel = useCallback(() => {
    setCurrentSaveCategoryForApp(null);
    onCloseSaveCategoryForAppSubPanel();
  }, [onCloseSaveCategoryForAppSubPanel]);

  const isLoading = isUpdating || isDeleting || isEditing.length > 0;

  return (
    <>
      <MyModal
        maxW={['90vw', '800px']}
        iconSrc="/imgs/modal/tag.svg"
        title={t('chat:setting.favourite.manage_categories_button')}
        isOpen={isOpen}
        onClose={handleClose}
      >
        {isSaveCategoryForAppSubPanelOpen ? (
          <SaveCategoryForAppSubPanel
            category={currentSaveCategoryForApp as Category}
            onClose={handleCloseSaveCategoryForAppSubPanel}
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
                      num: localCategories.length
                    })}
                  </Box>
                </Flex>

                <Button
                  w="80px"
                  fontWeight="400"
                  variant="whitePrimary"
                  isDisabled={isLoading}
                  leftIcon={<AddIcon fontSize="xs" />}
                  onClick={handleClickNewCategory}
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
              {localCategories.map((category) => (
                <Box
                  key={category.id}
                  pb="2"
                  _notLast={{
                    borderBottom: 'sm',
                    borderColor: 'myGray.200'
                  }}
                >
                  <EditableCategoryItem
                    category={category}
                    onCommit={handleCommitCategory}
                    isEditing={isEditing.includes(category.id)}
                    onStartEdit={() => setIsEditing((prev) => [...prev, category.id])}
                    onConfirmDelete={(c) => setCurrentDelCategory(c)}
                    onSaveCategoryForApp={handleOpenSaveCategoryForAppSubPanel}
                  />
                </Box>
              ))}
            </Flex>
          </Flex>
        )}
      </MyModal>

      <MyModal
        isOpen={!!currentDelCategory}
        iconSrc="/imgs/modal/warn.svg"
        title={t('chat:setting.favourite.categories_modal.delete_confirm_title')}
        onClose={() => setCurrentDelCategory(null)}
      >
        <Flex p={4} w={['auto', '420px']} flexDir="column" gap={4}>
          <Box color={'myGray.900'} fontSize={'sm'}>
            {t('chat:setting.favourite.categories_modal.delete_confirm', {
              name: currentDelCategory?.name
            })}
          </Box>

          <Flex justifyContent="flex-end" gap={3}>
            <Button variant="whitePrimary" onClick={() => setCurrentDelCategory(null)}>
              {t('chat:setting.favourite.categories_modal.delete_cancel_button')}
            </Button>

            <Button
              variant="dangerFill"
              isLoading={isDeleting}
              onClick={() => deleteCategory(currentDelCategory as Category)}
            >
              {t('chat:setting.favourite.categories_modal.delete_confirm_button')}
            </Button>
          </Flex>
        </Flex>
      </MyModal>
    </>
  );
};

export default React.memo(CategoryManageModal);
