import React, { useMemo, useState } from 'react';
import { Box, Button, Checkbox, Flex, HStack, useDisclosure } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { postBatchSetCollectionTags } from '@/web/core/dataset/api/collection';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { type DatasetCollectionsListItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  BatchCollectionTagModeEnum,
  type BatchSetCollectionTagItem
} from '@fastgpt/global/openapi/core/dataset/collection/tagApi';
import {
  DatasetCollectionTagTypeEnum,
  type CollectionTagValueType,
  type DatasetTagType
} from '@fastgpt/global/core/dataset/type';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { resolveDisplayedCollectionTag, TagTableContainer } from './TagCommon';
import TagManageModal from './TagManageModal';
import { useAppendDatasetTagOption } from './useAppendDatasetTagOption';
import { useCollectionTagRows } from './useCollectionTagRows';
import { CollectionTagTable } from './CollectionTagTable';
import { createEmptyTagRow, type CollectionTagRow } from './tagForm';

type BatchTagMode = (typeof BatchCollectionTagModeEnum)[keyof typeof BatchCollectionTagModeEnum];

type TagRowType = CollectionTagRow & {
  append?: boolean;
};

type CollectionTagBatchModalProps = {
  collections: DatasetCollectionsListItemType[];
  onClose: () => void;
  onSuccess?: () => void;
};

type RemoveTagGroup = {
  tagId: string;
  tagName: string;
  tagType: DatasetTagType['tagType'];
  values: string[];
};

const createEmptyBatchTagRow = (): TagRowType => ({
  ...createEmptyTagRow(),
  append: true
});

/** 从已选集合聚合可移除的标签：选项类收集去重后的值，其余类型只展示标签名。 */
const buildRemoveTagGroups = (
  collections: DatasetCollectionsListItemType[],
  tags: DatasetTagType[]
): RemoveTagGroup[] => {
  const groups = new Map<string, RemoveTagGroup>();

  for (const collection of collections) {
    for (const item of collection.tags ?? []) {
      const resolved = resolveDisplayedCollectionTag(item, tags);
      if (!resolved) continue;

      const tagId = String(resolved.tagDoc._id);
      const tagType = resolved.tagDoc.tagType ?? DatasetCollectionTagTypeEnum.string;
      const group = groups.get(tagId) ?? {
        tagId,
        tagName: resolved.tagDoc.tag,
        tagType,
        values: []
      };

      if (tagType === DatasetCollectionTagTypeEnum.array) {
        const list = Array.isArray(resolved.value)
          ? resolved.value
          : resolved.value !== ''
            ? [String(resolved.value)]
            : [];
        for (const value of list) {
          if (value && !group.values.includes(value)) {
            group.values.push(value);
          }
        }
      }

      groups.set(tagId, group);
    }
  }

  return [...groups.values()];
};

const CollectionTagBatchModal = ({
  collections,
  onClose,
  onSuccess
}: CollectionTagBatchModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { datasetDetail, allDatasetTags, isLoadingAllDatasetTags, loadAllDatasetTags } =
    useContextSelector(DatasetPageContext, (v) => v);
  const {
    isOpen: isTagManageOpen,
    onOpen: onOpenTagManage,
    onClose: onCloseTagManage
  } = useDisclosure();

  const [mode, setMode] = useState<BatchTagMode>(BatchCollectionTagModeEnum.add);
  const [initialRows] = useState<TagRowType[]>(() => [createEmptyBatchTagRow()]);
  const [expandedTagIds, setExpandedTagIds] = useState<Set<string>>(new Set());
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [selectedValues, setSelectedValues] = useState<Map<string, Set<string>>>(new Map());

  const {
    rows,
    hasIncompleteRow,
    isAddDisabled,
    updateRows,
    handleAddRow,
    handleDeleteRow,
    handleTagChange,
    handleValueChange
  } = useCollectionTagRows({
    tags: allDatasetTags,
    initialRows,
    createRow: createEmptyBatchTagRow,
    patchOnTagChange: (tagDoc) => ({
      append:
        (tagDoc?.tagType ?? DatasetCollectionTagTypeEnum.string) ===
        DatasetCollectionTagTypeEnum.number
    }),
    onRowDeleted: () => {
      toast({
        title: t('dataset:tag.delete_success'),
        status: 'success'
      });
    }
  });

  const removeGroups = useMemo(
    () => buildRemoveTagGroups(collections, allDatasetTags),
    [collections, allDatasetTags]
  );

  const { runAsync: onSave, loading: isSaving } = useRequest(
    (body: { mode: typeof mode; tags: BatchSetCollectionTagItem[] }) =>
      postBatchSetCollectionTags({
        datasetId: datasetDetail._id,
        collectionIds: collections.map((item) => item._id),
        mode: body.mode,
        tags: body.tags
      }),
    {
      onSuccess() {
        void loadAllDatasetTags();
        onSuccess?.();
        onClose();
      },
      successToast: t('dataset:tag.setting_success'),
      errorToast: t('dataset:tag.save_failed')
    }
  );

  const { runAsync: onAppendTagOption } = useAppendDatasetTagOption();

  const removePayload = useMemo(() => {
    const tags: BatchSetCollectionTagItem[] = [];
    for (const group of removeGroups) {
      if (group.tagType === DatasetCollectionTagTypeEnum.array) {
        const selected = selectedValues.get(group.tagId);
        if (!selected || selected.size === 0) continue;
        if (selected.size === group.values.length) {
          tags.push({ tagId: group.tagId });
        } else {
          tags.push({ tagId: group.tagId, value: [...selected] });
        }
        continue;
      }
      if (selectedTagIds.has(group.tagId)) {
        tags.push({ tagId: group.tagId });
      }
    }
    return tags;
  }, [removeGroups, selectedTagIds, selectedValues]);

  const isConfirmDisabled =
    isSaving ||
    (mode === BatchCollectionTagModeEnum.add
      ? rows.length === 0 || hasIncompleteRow
      : removePayload.length === 0);

  const toggleExpand = (tagId: string) => {
    setExpandedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const toggleNonArrayTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const toggleArrayValue = (tagId: string, value: string) => {
    setSelectedValues((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(tagId) ?? []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      if (current.size === 0) next.delete(tagId);
      else next.set(tagId, current);
      return next;
    });
  };

  const toggleArrayParent = (tagId: string, allValues: string[]) => {
    setSelectedValues((prev) => {
      const next = new Map(prev);
      const current = next.get(tagId);
      const isAllSelected = current && current.size === allValues.length && allValues.length > 0;
      if (isAllSelected) {
        next.delete(tagId);
      } else {
        next.set(tagId, new Set(allValues));
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (isConfirmDisabled) return;

    if (mode === BatchCollectionTagModeEnum.remove) {
      await onSave({ mode, tags: removePayload });
      return;
    }

    const tags: BatchSetCollectionTagItem[] = rows.map((row) => {
      const tagDoc = allDatasetTags.find((tag) => String(tag._id) === row.tagId);
      const tagType = tagDoc?.tagType ?? DatasetCollectionTagTypeEnum.string;
      return {
        tagId: row.tagId,
        value: row.value as CollectionTagValueType['value'],
        ...(tagType === DatasetCollectionTagTypeEnum.number ? { append: Boolean(row.append) } : {})
      };
    });

    await onSave({ mode: BatchCollectionTagModeEnum.add, tags });
  };

  const renderAddValueExtra = (row: TagRowType, selectedTag?: DatasetTagType) => {
    const tagType = selectedTag?.tagType ?? DatasetCollectionTagTypeEnum.string;
    if (tagType === DatasetCollectionTagTypeEnum.number) {
      return (
        <Flex gap={'16px'} h={'16px'} alignItems={'center'}>
          {(
            [
              { label: t('dataset:tag.append'), append: true },
              { label: t('dataset:tag.overwrite'), append: false }
            ] as const
          ).map((item) => {
            const checked = Boolean(row.append) === item.append;
            return (
              <Flex
                key={item.label}
                alignItems={'center'}
                gap={'8px'}
                h={'16px'}
                cursor={'pointer'}
                userSelect={'none'}
                onClick={() =>
                  updateRows((current) =>
                    current.map((currentRow) =>
                      currentRow.id === row.id ? { ...currentRow, append: item.append } : currentRow
                    )
                  )
                }
              >
                <Flex
                  w={'16px'}
                  h={'16px'}
                  borderWidth={'1px'}
                  borderColor={checked ? 'primary.600' : 'myGray.250'}
                  bg={checked ? 'primary.1' : 'white'}
                  borderRadius={'full'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  flexShrink={0}
                >
                  <Box
                    w={'6px'}
                    h={'6px'}
                    borderRadius={'full'}
                    bg={checked ? 'primary.600' : 'transparent'}
                  />
                </Flex>
                <Box fontSize={'xs'} lineHeight={'16px'} color={'myGray.600'}>
                  {item.label}
                </Box>
              </Flex>
            );
          })}
        </Flex>
      );
    }
    if (
      tagType === DatasetCollectionTagTypeEnum.array ||
      tagType === DatasetCollectionTagTypeEnum.datetime
    ) {
      return (
        <Flex
          alignItems={'center'}
          gap={1}
          h={'16px'}
          fontSize={'xs'}
          lineHeight={'16px'}
          fontWeight={'medium'}
          color={'myGray.500'}
        >
          <Box>{t('dataset:tag.overwrite_existing')}</Box>
          <QuestionTip label={t('dataset:tag.overwrite_tip')} w={'16px'} h={'16px'} />
        </Flex>
      );
    }
    return null;
  };

  return (
    <>
      <MyModal
        isOpen
        isLoading={isLoadingAllDatasetTags}
        onClose={onClose}
        size={'xl'}
        w={'800px'}
        minH={'400px'}
        maxH={'80vh'}
        isCentered
        title={
          <Flex alignItems={'center'} gap={2} whiteSpace={'nowrap'}>
            <Box>{t('dataset:tag.batch_edit')}</Box>
            <Box>{t('dataset:tag.batch_selected_files', { num: collections.length })}</Box>
          </Flex>
        }
        closeOnOverlayClick={false}
        bodyStyles={{
          flex: 1,
          minH: 0,
          pb: 0,
          overflow: 'hidden'
        }}
        footerStyles={{
          justifyContent: 'space-between',
          px: 8,
          pt: 2,
          pb: 8
        }}
        footer={
          <>
            <Button
              h={'32px'}
              px={'14px'}
              variant={'primaryOutline'}
              color={'primary.700'}
              leftIcon={<MyIcon name={'common/addLight'} w={'18px'} h={'18px'} />}
              visibility={mode === BatchCollectionTagModeEnum.add ? 'visible' : 'hidden'}
              pointerEvents={mode === BatchCollectionTagModeEnum.add ? 'auto' : 'none'}
              isDisabled={isAddDisabled}
              onClick={handleAddRow}
            >
              {t('dataset:tag.add_tag')}
            </Button>

            <HStack spacing={3}>
              <Button w={'64px'} h={'32px'} variant={'whiteBase'} onClick={onClose}>
                {t('common:Cancel')}
              </Button>
              <Button
                w={'64px'}
                h={'32px'}
                variant={'primary'}
                isLoading={isSaving}
                isDisabled={isConfirmDisabled}
                onClick={handleSubmit}
              >
                {t('common:Confirm')}
              </Button>
            </HStack>
          </>
        }
        borderRadius={'10px'}
        sx={{
          '.chakra-modal__close-btn': {
            top: 2,
            right: 2,
            w: '36px',
            h: '36px'
          }
        }}
      >
        <Flex direction={'column'} gap={4} flex={1} minH={0}>
          <FillRowTabs<BatchTagMode>
            list={[
              { label: t('dataset:tag.batch_add'), value: BatchCollectionTagModeEnum.add },
              { label: t('dataset:tag.batch_remove'), value: BatchCollectionTagModeEnum.remove }
            ]}
            value={mode}
            onChange={setMode}
            outerHeight={'40px'}
            itemHeight={'32px'}
            px={'12px'}
            alignSelf={'flex-start'}
            flexShrink={0}
          />

          {mode === BatchCollectionTagModeEnum.add ? (
            <CollectionTagTable
              rows={rows}
              tags={allDatasetTags}
              onTagChange={handleTagChange}
              onValueChange={handleValueChange}
              onDeleteRow={handleDeleteRow}
              onManage={onOpenTagManage}
              onCreateOption={(tagId, option) => {
                void onAppendTagOption({ tagId, option });
              }}
              renderValueExtra={renderAddValueExtra}
              valueFieldProps={{
                disabledPlaceholder: t('dataset:tag.select_tag_first'),
                numberShowStepper: true,
                numberPlaceholder: t('dataset:tag.fill_integer'),
                arrayPlaceholder: t('dataset:tag.select_tag_value')
              }}
            />
          ) : (
            <TagTableContainer>
              <Box flex={1} minH={0} overflowY={'auto'}>
                {removeGroups.length === 0 ? (
                  <EmptyTip text={t('dataset:dataset.no_tags')} />
                ) : (
                  <Flex direction={'column'} gap={'8px'}>
                    {removeGroups.map((group) => {
                      const isArray = group.tagType === DatasetCollectionTagTypeEnum.array;
                      const selected = selectedValues.get(group.tagId) ?? new Set<string>();
                      const isAllSelected =
                        isArray && group.values.length > 0 && selected.size === group.values.length;
                      const isIndeterminate =
                        isArray && selected.size > 0 && selected.size < group.values.length;
                      const isExpanded = expandedTagIds.has(group.tagId);
                      const count = isArray ? group.values.length : 1;

                      return (
                        <Flex
                          key={group.tagId}
                          direction={'column'}
                          gap={'8px'}
                          p={'4px'}
                          border={'1px solid'}
                          borderColor={'myGray.200'}
                          borderRadius={'md'}
                          cursor={'pointer'}
                          onClick={() =>
                            isArray
                              ? toggleArrayParent(group.tagId, group.values)
                              : toggleNonArrayTag(group.tagId)
                          }
                        >
                          <Flex
                            alignItems={'center'}
                            justifyContent={'space-between'}
                            h={'28px'}
                            px={'8px'}
                            py={'4px'}
                            borderRadius={'xs'}
                            _hover={{ bg: 'myGray.50' }}
                          >
                            <Flex alignItems={'center'} gap={'8px'} minW={0}>
                              <Checkbox
                                pointerEvents={'none'}
                                isChecked={
                                  isArray ? isAllSelected : selectedTagIds.has(group.tagId)
                                }
                                isIndeterminate={isIndeterminate}
                                size={'sm'}
                              />
                              <Box
                                fontSize={'sm'}
                                lineHeight={'20px'}
                                color={'myGray.900'}
                                noOfLines={1}
                              >
                                {group.tagName}（{count}）
                              </Box>
                            </Flex>
                            {isArray && group.values.length > 0 && (
                              <Flex
                                as={'button'}
                                type={'button'}
                                alignItems={'center'}
                                justifyContent={'center'}
                                p={'4px'}
                                w={'24px'}
                                h={'24px'}
                                flexShrink={0}
                                borderRadius={'sm'}
                                color={'myGray.500'}
                                _hover={{ bg: 'myGray.05' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(group.tagId);
                                }}
                              >
                                <MyIcon
                                  name={'core/chat/chevronDown'}
                                  w={'16px'}
                                  h={'16px'}
                                  transform={isExpanded ? 'rotate(180deg)' : undefined}
                                />
                              </Flex>
                            )}
                          </Flex>
                          {isArray &&
                            isExpanded &&
                            group.values.map((value) => (
                              <Flex
                                key={value}
                                alignItems={'center'}
                                gap={'8px'}
                                h={'28px'}
                                px={'32px'}
                                py={'4px'}
                                borderRadius={'xs'}
                                _hover={{ bg: 'myGray.50' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleArrayValue(group.tagId, value);
                                }}
                              >
                                <Checkbox
                                  pointerEvents={'none'}
                                  isChecked={selected.has(value)}
                                  size={'sm'}
                                />
                                <Box fontSize={'sm'} lineHeight={'20px'} color={'myGray.900'}>
                                  {value}
                                </Box>
                              </Flex>
                            ))}
                        </Flex>
                      );
                    })}
                  </Flex>
                )}
              </Box>
            </TagTableContainer>
          )}
        </Flex>
      </MyModal>
      {isTagManageOpen && <TagManageModal onClose={onCloseTagManage} />}
    </>
  );
};

export default React.memo(CollectionTagBatchModal);
