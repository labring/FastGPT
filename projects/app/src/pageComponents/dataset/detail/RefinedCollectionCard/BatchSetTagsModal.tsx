import React, { useState, useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  Input,
  NumberInput,
  NumberInputField,
  Checkbox,
  Text,
  Divider,
  ModalBody,
  ModalFooter
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { CollectionPageContext } from '../CollectionCard/Context';
import { batchSetCollectionTags } from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type {
  CollectionTagValueType,
  DatasetCollectionsListItemType
} from '@fastgpt/global/core/dataset/type';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import TagRowsEditor from './TagRowsEditor';

type TagRow = {
  tagId: string;
  value: string;
  checked: boolean;
  isNew: boolean;
  deleteFlag?: boolean;
};

const ValueInput = ({
  tagType,
  value,
  onChange,
  disabled
}: {
  tagType: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  if (tagType === 'number') {
    return (
      <NumberInput
        flex={1}
        value={value}
        onChange={(v) => onChange(v)}
        isDisabled={disabled}
        min={undefined}
      >
        <NumberInputField h="32px" bg="white" placeholder={t('dataset:tag.tag_value_number')} />
      </NumberInput>
    );
  }
  if (tagType === 'datetime') {
    return (
      <Input
        flex={1}
        h="32px"
        bg="white"
        type="datetime-local"
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        isDisabled={disabled}
      />
    );
  }
  return (
    <Input
      flex={1}
      h="32px"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('dataset:tag.tag_value')}
      isDisabled={disabled}
    />
  );
};

const BatchSetTagsModal = ({
  selectedCollections,
  datasetId,
  onClose
}: {
  selectedCollections: DatasetCollectionsListItemType[];
  datasetId: string;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  const { allDatasetTags } = useContextSelector(DatasetPageContext, (v) => v);
  const { getData, pageNum } = useContextSelector(CollectionPageContext, (v) => v);

  const tagMap = useMemo(
    () =>
      new Map<string, DatasetTagType>(
        allDatasetTags.map((tag) => [tag._id, tag] as [string, DatasetTagType])
      ),
    [allDatasetTags]
  );

  const existingTagIds = useMemo(() => {
    const ids = new Set<string>();
    selectedCollections.forEach((c) => {
      (c.tags || []).forEach((tag) => {
        if (typeof tag === 'object' && tag !== null) {
          ids.add((tag as CollectionTagValueType).tagId);
        }
      });
    });
    return ids;
  }, [selectedCollections]);

  const initExistingRows: TagRow[] = useMemo(
    () =>
      allDatasetTags
        .filter((tag) => existingTagIds.has(tag._id))
        .map((tag) => {
          let defaultValue = '';
          for (const c of selectedCollections) {
            const found = (c.tags || []).find(
              (t) => typeof t === 'object' && (t as CollectionTagValueType).tagId === tag._id
            ) as CollectionTagValueType | undefined;
            if (found) {
              const ts = Number(found.value);
              defaultValue =
                tag.tagType === 'datetime' && !isNaN(ts) && ts > 0
                  ? new Date(ts).toISOString().slice(0, 19)
                  : String(found.value);
              break;
            }
          }
          return { tagId: tag._id, value: defaultValue, checked: true, isNew: false };
        }),
    [allDatasetTags, existingTagIds, selectedCollections]
  );

  const [existingRows, setExistingRows] = useState<TagRow[]>(initExistingRows);
  const [newRows, setNewRows] = useState<{ tagId: string; value: string }[]>([]);

  const allTagOptions = useMemo(
    () => allDatasetTags.map((t) => ({ label: t.tag, value: t._id, tagType: t.tagType })),
    [allDatasetTags]
  );

  const newTagOptions = useMemo(() => {
    const existingIds = new Set(existingRows.map((r) => r.tagId));
    return allTagOptions.map((opt) => ({
      ...opt,
      isDisabled: existingIds.has(opt.value)
    }));
  }, [allTagOptions, existingRows]);

  const updateExisting = (index: number, field: keyof TagRow, val: any) => {
    setExistingRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const { runAsync: onSave, loading } = useRequest(
    async () => {
      const tagsToSet: CollectionTagValueType[] = [
        ...existingRows
          .filter((row) => row.checked && !row.deleteFlag)
          .map((row) => {
            const isDatetime = tagMap.get(row.tagId)?.tagType === 'datetime';
            return {
              tagId: row.tagId,
              value: isDatetime ? new Date(row.value + 'Z').getTime() : row.value
            };
          }),
        ...newRows.map((row) => {
          const isDatetime = tagMap.get(row.tagId)?.tagType === 'datetime';
          return {
            tagId: row.tagId,
            value: isDatetime ? new Date(row.value + 'Z').getTime() : row.value
          };
        })
      ];

      const deleteTagIds = existingRows.filter((row) => row.deleteFlag).map((row) => row.tagId);

      return batchSetCollectionTags({
        collectionIds: selectedCollections.map((c) => c._id),
        tags: tagsToSet,
        deleteTagIds,
        datasetId
      });
    },
    {
      onSuccess() {
        getData(pageNum);
        onClose();
      },
      successToast: t('common:save_success'),
      errorToast: t('common:save_failed')
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={
        <Flex align={'center'}>
          {t('dataset:tag.batch_set_tags_count', { count: selectedCollections.length })}
          <QuestionTip label={t('dataset:tag.manage_tip')} ml={3} />
        </Flex>
      }
      w={'600px'}
    >
      <ModalBody p={8}>
        {/* 已有标签区域 */}
        {existingRows.length > 0 && (
          <>
            <Flex align={'center'} h="32px" mb={1}>
              <Text fontSize={'12px'} lineHeight={'16px'} color={'#333333'}>
                {t('dataset:tag.existing_tags_tip')}
              </Text>
            </Flex>
            <Box>
              {existingRows.map((row, index) => {
                const tagDef = tagMap.get(row.tagId);
                const tagType = tagDef?.tagType || 'string';
                const isDeleted = !!row.deleteFlag;
                return (
                  <Flex key={index} align={'center'} h="32px" mb={1} gap={0}>
                    <Checkbox
                      isChecked={row.checked}
                      onChange={(e) => updateExisting(index, 'checked', e.target.checked)}
                      isDisabled={isDeleted}
                    />
                    <Text
                      ml={2}
                      w={'80px'}
                      flexShrink={0}
                      fontSize={'12px'}
                      fontWeight={500}
                      lineHeight={'16px'}
                      color={isDeleted ? '#666666' : '#111824'}
                      textDecoration={isDeleted ? 'line-through' : 'none'}
                      noOfLines={1}
                    >
                      {tagDef?.tag || row.tagId}
                    </Text>
                    <Box flex={1} ml={4}>
                      <ValueInput
                        tagType={tagType}
                        value={row.value}
                        onChange={(v) => updateExisting(index, 'value', v)}
                        disabled={!row.checked || isDeleted}
                      />
                    </Box>
                    <MyTooltip label={isDeleted ? t('dataset:tag.cancel_delete') : undefined}>
                      <Flex
                        ml={1}
                        w="32px"
                        h="32px"
                        align={'center'}
                        justify={'center'}
                        borderRadius={'6px'}
                        border={isDeleted ? '1px solid #FDA29B' : '1px solid transparent'}
                        bg={isDeleted ? '#FEF3F2' : 'transparent'}
                        cursor={!row.checked && !isDeleted ? 'not-allowed' : 'pointer'}
                        _hover={
                          !row.checked && !isDeleted
                            ? {}
                            : {
                                bg: isDeleted ? '#FEF3F2' : 'red.50',
                                border: isDeleted ? '1px solid #FDA29B' : '1px solid transparent',
                                color: 'red.500'
                              }
                        }
                        color={isDeleted ? '#D92D20' : !row.checked ? 'myGray.300' : 'myGray.550'}
                        onClick={() => {
                          if (!row.checked && !isDeleted) return;
                          updateExisting(index, 'deleteFlag', !isDeleted);
                        }}
                      >
                        <MyIcon name={'delete'} w={'16px'} h={'16px'} />
                      </Flex>
                    </MyTooltip>
                  </Flex>
                );
              })}
            </Box>
            <Divider my={2} borderColor={'#EBEDF0'} />
          </>
        )}

        {/* 新标签区域 */}
        <Flex align={'center'} h="32px" mb={1}>
          <Text fontSize={'12px'} lineHeight={'16px'} color={'#333333'}>
            {t('dataset:tag.new_tags_tip')}
          </Text>
        </Flex>
        <TagRowsEditor
          rows={newRows}
          allTagOptions={newTagOptions}
          onAddRow={() => setNewRows((prev) => [...prev, { tagId: '', value: '' }])}
          onUpdateRow={(index, field, val) =>
            setNewRows((prev) =>
              prev.map((row, i) => (i === index ? { ...row, [field]: val } : row))
            )
          }
          onRemoveRow={(index) => setNewRows((prev) => prev.filter((_, i) => i !== index))}
        />
      </ModalBody>

      <ModalFooter gap={3}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          isLoading={loading}
          isDisabled={
            existingRows.some((row) => row.checked && !row.deleteFlag && row.value === '') ||
            newRows.some((row) => !row.tagId || row.value === '')
          }
          onClick={onSave}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default BatchSetTagsModal;
