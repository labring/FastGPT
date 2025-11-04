import { Box, Button, Flex, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useEffect, useRef, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag/index';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { nanoid } from 'nanoid';
import {
  createPluginToolTag,
  deletePluginToolTag,
  updatePluginToolTag,
  updatePluginToolTagOrder
} from '@/web/core/plugin/admin/tool/api';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useToast } from '@fastgpt/web/hooks/useToast';

const TagManageModal = ({ onClose }: { onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const newTagInputRef = useRef<HTMLInputElement>(null);

  const [localTags, setLocalTags] = useState<SystemPluginToolTagType[]>([]);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const checkTagNameDuplicate = (tagName: string, excludeTagId?: string): boolean => {
    return localTags.some((tag) => {
      if (excludeTagId && tag.tagId === excludeTagId) {
        return false;
      }
      const existingName = parseI18nString(tag.tagName, i18n.language);
      return existingName === tagName;
    });
  };

  const {
    data: tags = [],
    run: loadTags,
    loading
  } = useRequest2(getPluginToolTags, {
    manual: false
  });
  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);

  useEffect(() => {
    if (editingTagId && newTagInputRef.current) {
      newTagInputRef.current?.focus();
    }
  }, [editingTagId]);

  const { runAsync: handleAddTag } = useRequest2(
    async (tagName: string) => {
      await createPluginToolTag({ tagName });
    },
    {
      onSuccess: () => {
        setEditingTagId(null);
        setInputValue('');
        loadTags();
      }
    }
  );

  const { runAsync: handleUpdateTag } = useRequest2(
    async (tagId: string, tagName: string) => {
      await updatePluginToolTag({ tagId, tagName });
    },
    {
      onSuccess: () => {
        setEditingTagId(null);
        setInputValue('');
        loadTags();
      }
    }
  );

  const { runAsync: handleDeleteTag } = useRequest2(
    async (tag: SystemPluginToolTagType) => {
      await deletePluginToolTag({ tagId: tag.tagId });
    },
    {
      onSuccess: () => {
        loadTags();
      }
    }
  );

  const { runAsync: handleUpdateOrder } = useRequest2(
    async (newList: SystemPluginToolTagType[]) => {
      await updatePluginToolTagOrder({ tags: newList });
    },
    {
      onSuccess: () => {
        loadTags();
      }
    }
  );

  return (
    <MyModal
      isOpen
      isLoading={loading}
      title={t('app:toolkit_tags_manage_title')}
      iconSrc={'common/setting'}
      iconColor={'primary.600'}
      onClose={onClose}
      w={'580px'}
      h={'600px'}
    >
      <ModalBody display={'flex'} flexDirection={'column'} px={0}>
        <Flex
          alignItems={'center'}
          color={'myGray.900'}
          pb={2}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          mx={12}
          pt={6}
          px={2}
          flexShrink={0}
        >
          <MyIcon name="menu" w={5} />
          <Box ml={2} fontWeight={'semibold'} flex={'1 0 0'}>
            {t('app:toolkit_tags_total', { count: localTags.length })}
          </Box>
          <Button
            size={'sm'}
            leftIcon={<MyIcon name="common/addLight" w={4} />}
            variant={'outline'}
            fontSize={'xs'}
            onClick={() => {
              setEditingTagId(nanoid());
              setInputValue('');
            }}
          >
            {t('app:toolkit_tags_add')}
          </Button>
        </Flex>

        <Box px={12} mt={2} flex={'1 0 0'} fontSize={'sm'} overflowY={'auto'}>
          {editingTagId && !localTags.find((tag) => tag.tagId === editingTagId) && (
            <Flex h={10} alignItems={'center'} mb={2} px={2} bg={'myGray.50'} borderRadius={'md'}>
              <Input
                placeholder={t('app:toolkit_tags_enter_name')}
                value={inputValue}
                size={'sm'}
                ref={newTagInputRef}
                maxLength={5}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={() => {
                  const trimmedValue = inputValue.trim();
                  if (trimmedValue) {
                    if (checkTagNameDuplicate(trimmedValue)) {
                      toast({
                        title: t('app:toolkit_tags_duplicate_name'),
                        status: 'warning'
                      });
                      setEditingTagId(null);
                      setInputValue('');
                    } else {
                      handleAddTag(trimmedValue);
                    }
                  } else {
                    setEditingTagId(null);
                    setInputValue('');
                  }
                }}
              />
            </Flex>
          )}

          <DndDrag<SystemPluginToolTagType>
            onDragEndCb={async (tags: SystemPluginToolTagType[]) => {
              const newList = tags.map((item, index) => ({
                ...item,
                tagOrder: index
              }));
              setLocalTags(newList);
              await handleUpdateOrder(newList);
            }}
            dataList={localTags}
          >
            {({ provided }) => (
              <Box {...provided.droppableProps} ref={provided.innerRef}>
                {localTags.map((tag, index) => {
                  const isEditing = editingTagId === tag.tagId;
                  const displayName = parseI18nString(tag.tagName, i18n.language);

                  return (
                    <Draggable key={tag.tagId} draggableId={tag.tagId} index={index}>
                      {(provided, snapshot) => (
                        <Flex
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={{
                            ...provided.draggableProps.style,
                            opacity: snapshot.isDragging ? 0.8 : 1
                          }}
                          h={10}
                          alignItems={'center'}
                          px={2}
                          py={1}
                          my={1}
                          borderBottom={'1px solid'}
                          borderColor={'myGray.100'}
                        >
                          {isEditing ? (
                            <Input
                              placeholder={t('app:toolkit_tags_name')}
                              value={inputValue}
                              size={'sm'}
                              ref={newTagInputRef}
                              maxLength={5}
                              onChange={(e) => setInputValue(e.target.value)}
                              onBlur={() => {
                                const trimmedValue = inputValue.trim();
                                if (editingTagId && trimmedValue) {
                                  if (checkTagNameDuplicate(trimmedValue, editingTagId)) {
                                    toast({
                                      title: t('app:toolkit_tags_duplicate_name'),
                                      status: 'warning'
                                    });
                                    setEditingTagId(null);
                                    setInputValue('');
                                  } else {
                                    handleUpdateTag(editingTagId, trimmedValue);
                                  }
                                } else {
                                  setEditingTagId(null);
                                  setInputValue('');
                                }
                              }}
                            />
                          ) : (
                            <Flex w={'full'} alignItems={'center'}>
                              <Flex
                                h={'full'}
                                rounded={'xs'}
                                mr={2}
                                cursor={'grab'}
                                _hover={{ bg: 'myGray.05' }}
                                {...provided.dragHandleProps}
                              >
                                <MyIcon name="drag" w={'14px'} color={'myGray.400'} />
                              </Flex>
                              <Box
                                as={'span'}
                                py={1}
                                color={'myGray.900'}
                                borderRadius={'8px'}
                                fontSize={'sm'}
                                fontWeight={'medium'}
                              >
                                {t(displayName)}
                              </Box>
                              <Flex flex={1} />

                              {!tag.isSystem && (
                                <>
                                  <Flex
                                    _hover={{ bg: 'myGray.100' }}
                                    mr={1}
                                    p={1}
                                    borderRadius={'sm'}
                                    cursor={'pointer'}
                                    onClick={() => {
                                      setEditingTagId(tag.tagId);
                                      setInputValue(displayName);
                                    }}
                                  >
                                    <MyIcon name="edit" w={4} color={'myGray.600'} />
                                  </Flex>
                                  <PopoverConfirm
                                    type="delete"
                                    content={t('app:toolkit_tags_delete_confirm')}
                                    Trigger={
                                      <Flex
                                        _hover={{ bg: 'myGray.100' }}
                                        p={1}
                                        borderRadius={'sm'}
                                        cursor={'pointer'}
                                      >
                                        <MyIcon name="delete" w={4} color={'myGray.600'} />
                                      </Flex>
                                    }
                                    onConfirm={() => handleDeleteTag(tag)}
                                  />
                                </>
                              )}
                            </Flex>
                          )}
                        </Flex>
                      )}
                    </Draggable>
                  );
                })}
              </Box>
            )}
          </DndDrag>
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>{t('common:Close')}</Button>
      </ModalFooter>
    </MyModal>
  );
};

export default TagManageModal;
