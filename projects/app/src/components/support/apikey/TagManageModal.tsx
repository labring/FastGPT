import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, Input } from '@chakra-ui/react';
import type { OpenApiTagType } from '@fastgpt/global/openapi/support/openapi/tag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { createOpenApiTag, deleteOpenApiTag, updateOpenApiTag } from '@/web/support/openapi/api';
import { useTranslation } from 'next-i18next';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';

const ApiKeyTagBox = ({ name }: { name: string }) => (
  <MyTooltip label={name} showOnlyWhenOverflow>
    <Box
      px={3}
      py={1.5}
      bg={'#DBF3FF'}
      color={'#0884DD'}
      fontSize={'xs'}
      borderRadius={'sm'}
      maxW={'260px'}
      overflow={'hidden'}
      textOverflow={'ellipsis'}
      whiteSpace={'nowrap'}
    >
      {name}
    </Box>
  </MyTooltip>
);

const TagManageModal = ({
  tags,
  onClose,
  onRefreshTags,
  onRefreshKeys
}: {
  tags: OpenApiTagType[];
  onClose: () => void;
  onRefreshTags: () => void;
  onRefreshKeys?: () => void;
}) => {
  const { t } = useTranslation();
  const tagInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [orderedTags, setOrderedTags] = useState<OpenApiTagType[] | undefined>(undefined);
  const [newTag, setNewTag] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [currentEditTag, setCurrentEditTag] = useState<OpenApiTagType | undefined>(undefined);
  const [currentEditTagContent, setCurrentEditTagContent] = useState<string | undefined>(undefined);
  const localTags = orderedTags || tags;

  useEffect(() => {
    if (newTag !== undefined) {
      tagInputRef.current?.focus();
    }
  }, [newTag]);

  useEffect(() => {
    if (currentEditTag !== undefined) {
      editInputRef.current?.focus();
    }
  }, [currentEditTag]);

  const filteredTags = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return localTags;

    return localTags.filter((tag) => tag.name.toLowerCase().includes(keyword));
  }, [searchText, localTags]);

  const { runAsync: onCreateTag } = useRequest(async (name: string) => createOpenApiTag({ name }), {
    successToast: t('common:create_success'),
    errorToast: t('common:create_failed'),
    onSuccess() {
      setOrderedTags(undefined);
      onRefreshTags();
    }
  });

  const { runAsync: onUpdateTag } = useRequest(
    async ({ tagId, name }: { tagId: string; name: string }) => updateOpenApiTag({ tagId, name }),
    {
      successToast: t('common:update_success'),
      errorToast: t('common:update_failed'),
      onSuccess() {
        setOrderedTags(undefined);
        onRefreshTags();
      }
    }
  );
  const { runAsync: onUpdateTagOrders } = useRequest(
    async (updates: { tagId: string; order: number }[]) => {
      await Promise.all(updates.map((item) => updateOpenApiTag(item)));
    },
    {
      errorToast: t('common:update_failed'),
      onSuccess() {
        onRefreshTags();
      }
    }
  );

  const { runAsync: onDeleteTag } = useRequest(deleteOpenApiTag, {
    successToast: t('common:delete_success'),
    errorToast: t('common:delete_failed'),
    onSuccess() {
      setOrderedTags(undefined);
      onRefreshTags();
      onRefreshKeys?.();
    }
  });

  const submitCreate = async () => {
    const name = newTag?.trim();
    if (name && !tags.some((tag) => tag.name === name)) {
      await onCreateTag(name);
    }
    setNewTag(undefined);
  };

  const submitUpdate = async (tag: OpenApiTagType) => {
    const name = currentEditTagContent?.trim();
    if (name && name !== tag.name && !tags.some((item) => item.name === name)) {
      await onUpdateTag({
        tagId: tag._id,
        name
      });
    }
    setCurrentEditTag(undefined);
    setCurrentEditTagContent(undefined);
  };

  const updateTagOrder = async (nextTags: OpenApiTagType[]) => {
    setOrderedTags(nextTags);

    const updates = nextTags
      .map((tag, index) => ({
        tagId: tag._id,
        order: (index + 1) * 10,
        originOrder: tag.order
      }))
      .filter((item) => item.order !== item.originOrder)
      .map(({ tagId, order }) => ({ tagId, order }));

    if (updates.length > 0) {
      await onUpdateTagOrders(updates);
    }
  };

  const reorderVisibleTags = async (sortedVisibleTags: OpenApiTagType[]) => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) {
      await updateTagOrder(sortedVisibleTags);
      return;
    }

    const sortedVisibleTagIds = new Set(sortedVisibleTags.map((tag) => tag._id));
    let sortedVisibleIndex = 0;
    const nextTags = localTags.map((tag) =>
      sortedVisibleTagIds.has(tag._id) ? sortedVisibleTags[sortedVisibleIndex++] : tag
    );

    await updateTagOrder(nextTags);
  };

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('account_apikey:tag_manage')}
      w={'580px'}
      h={'600px'}
      closeOnOverlayClick={false}
      bodyStyles={{
        px: 0,
        pt: 0,
        pb: 0,
        overflow: 'hidden'
      }}
    >
      <Flex
        alignItems={'center'}
        color={'myGray.900'}
        pb={2}
        borderBottom={'1px solid #E8EBF0'}
        mx={8}
        pt={6}
      >
        <MyIcon name="menu" w={5} />
        <Box ml={2} fontWeight={'semibold'} flex={'1 0 0'}>
          {t('account_apikey:tag_total', {
            total: localTags.length
          })}
        </Box>
        <MyInput
          placeholder={t('common:Search')}
          w={'160px'}
          h={8}
          mr={2}
          onChange={(e) => {
            setSearchText(e.target.value);
          }}
        />
        <Button
          size={'sm'}
          h={8}
          minH={8}
          leftIcon={<MyIcon name="common/addLight" w={4} />}
          variant={'whitePrimary'}
          fontSize={'xs'}
          onClick={() => {
            setNewTag('');
          }}
        >
          {t('common:new_create')}
        </Button>
      </Flex>
      <Flex px={8} w={'full'}>
        {newTag !== undefined && (
          <Flex py={3} px={2} w={'full'} borderBottom={'1px solid #E8EBF0'}>
            <Input
              placeholder={t('account_apikey:tag_name')}
              value={newTag}
              maxLength={50}
              isRequired
              onChange={(e) => setNewTag(e.target.value)}
              ref={tagInputRef}
              w={'200px'}
              onBlur={submitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  submitCreate();
                }
              }}
            />
          </Flex>
        )}
      </Flex>
      <Flex
        px={8}
        flex={'1 0 0'}
        fontSize={'sm'}
        pb={2}
        overflowY={'auto'}
        flexDirection={'column'}
      >
        {filteredTags.length === 0 ? (
          <Box py={8} textAlign={'center'} color={'myGray.500'}>
            {t('account_apikey:no_tags')}
          </Box>
        ) : (
          <DndDrag<OpenApiTagType>
            dataList={filteredTags}
            onDragEndCb={reorderVisibleTags}
            renderInnerPlaceholder={false}
          >
            {({ provided }) => (
              <Flex ref={provided.innerRef} {...provided.droppableProps} flexDirection={'column'}>
                {filteredTags.map((tag, index) => (
                  <Draggable
                    key={tag._id}
                    draggableId={tag._id}
                    index={index}
                    isDragDisabled={currentEditTag?._id === tag._id}
                  >
                    {(provided, snapshot) => (
                      <Flex
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={{
                          ...provided.draggableProps.style,
                          opacity: snapshot.isDragging ? 0.8 : 1
                        }}
                        py={2}
                        borderBottom={'1px solid #E8EBF0'}
                        sx={{
                          '&:hover .icon-box': {
                            display: 'flex'
                          }
                        }}
                      >
                        <Flex
                          px={2}
                          py={1}
                          flex={'1'}
                          _hover={{ bg: 'myGray.100' }}
                          alignItems={'center'}
                          borderRadius={'xs'}
                        >
                          <Flex flex={'1 0 0'} alignItems={'center'} minW={0}>
                            <Box
                              {...provided.dragHandleProps}
                              mr={2}
                              cursor={'grab'}
                              lineHeight={1}
                              flexShrink={0}
                            >
                              <MyIcon name="drag" w={4} color={'myGray.400'} />
                            </Box>
                            {currentEditTag?._id !== tag._id ? (
                              <ApiKeyTagBox name={tag.name} />
                            ) : (
                              <Input
                                placeholder={t('account_apikey:edit_tag')}
                                value={
                                  currentEditTagContent !== undefined
                                    ? currentEditTagContent
                                    : tag.name
                                }
                                onChange={(e) => setCurrentEditTagContent(e.target.value)}
                                ref={editInputRef}
                                maxLength={50}
                                isRequired
                                w={'200px'}
                                onBlur={() => submitUpdate(tag)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    submitUpdate(tag);
                                  }
                                }}
                              />
                            )}
                            {tag.keyCount !== undefined && (
                              <Box as={'span'} color={'myGray.500'} ml={2}>{`(${
                                tag.keyCount
                              })`}</Box>
                            )}
                          </Flex>

                          <>
                            <Box
                              className="icon-box"
                              display="none"
                              _hover={{ bg: '#1118240D' }}
                              mr={2}
                              p={1}
                              borderRadius={'sm'}
                              cursor={'pointer'}
                              onClick={() => {
                                setCurrentEditTag(tag);
                                setCurrentEditTagContent(tag.name);
                              }}
                            >
                              <MyIcon name="edit" w={4} />
                            </Box>
                            <PopoverConfirm
                              showCancel
                              content={t('account_apikey:delete_tag_confirm')}
                              type="delete"
                              Trigger={
                                <Box
                                  className="icon-box"
                                  display="none"
                                  _hover={{ bg: '#1118240D' }}
                                  p={1}
                                  borderRadius={'sm'}
                                  cursor={'pointer'}
                                >
                                  <MyIcon name="delete" w={4} />
                                </Box>
                              }
                              onConfirm={() => onDeleteTag(tag._id)}
                            />
                          </>
                        </Flex>
                      </Flex>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </Flex>
            )}
          </DndDrag>
        )}
      </Flex>
    </MyModal>
  );
};

export default React.memo(TagManageModal);
