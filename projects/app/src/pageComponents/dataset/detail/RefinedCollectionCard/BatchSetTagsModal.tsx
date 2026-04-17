import React, { useState, useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  HStack,
  IconButton,
  Checkbox,
  Text
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { CollectionPageContext } from '../CollectionCard/Context';
import { batchSetCollectionTags } from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { CollectionTagValueType, DatasetTagType } from '@fastgpt/global/core/dataset/type';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import DateTimePicker from '@fastgpt/web/components/common/DateTimePicker';
import { utcTsToDisplayDate, displayDateToUtcTs } from '@fastgpt/global/common/string/time';

type TagRow = {
  tagId: string;
  value: string;
  checked: boolean; // 是否生效（仅已有标签行有此概念）
  isNew: boolean; // 是否是新添加的标签
  deleteFlag?: boolean; // 标记为删除
};

const ValueInput = ({
  tagType,
  value,
  onChange,
  disabled,
  t
}: {
  tagType: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  t: (key: string) => string;
}) => {
  if (tagType === 'number') {
    return (
      <NumberInput flex={1} value={value} onChange={(v) => onChange(v)} isDisabled={disabled}>
        <NumberInputField placeholder="0" />
      </NumberInput>
    );
  }
  if (tagType === 'datetime') {
    const ts = Number(value);
    const dateValue = !isNaN(ts) && ts > 0 ? utcTsToDisplayDate(ts) : null;
    return (
      <Box flex={1}>
        <DateTimePicker
          value={dateValue}
          onChange={(date) => onChange(date ? String(displayDateToUtcTs(date)) : '')}
          disabled={disabled}
        />
      </Box>
    );
  }
  return (
    <Input
      flex={1}
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
    () => new Map<string, DatasetTagType>(allDatasetTags.map((tag) => [tag._id, tag])),
    [allDatasetTags]
  );

  // 计算所有选中 collection 中已存在的 tagId 集合（仅新格式）
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

  // 已有标签行（来自 allDatasetTags 中存在于某个 collection 的）
  const initExistingRows: TagRow[] = useMemo(
    () =>
      allDatasetTags
        .filter((tag) => existingTagIds.has(tag._id))
        .map((tag) => {
          // 查找第一个匹配的 value（多个 collection 时值可能不同，用第一个作为默认）
          let defaultValue = '';
          for (const c of selectedCollections) {
            const found = (c.tags || []).find(
              (t) => typeof t === 'object' && (t as CollectionTagValueType).tagId === tag._id
            ) as CollectionTagValueType | undefined;
            if (found) {
              defaultValue = String(found.value);
              break;
            }
          }
          return { tagId: tag._id, value: defaultValue, checked: true, isNew: false };
        }),
    [allDatasetTags, existingTagIds, selectedCollections]
  );

  const [existingRows, setExistingRows] = useState<TagRow[]>(initExistingRows);
  const [newRows, setNewRows] = useState<TagRow[]>([]);

  const updateExisting = (index: number, field: keyof TagRow, val: any) => {
    setExistingRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const updateNew = (index: number, field: keyof TagRow, val: any) => {
    setNewRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const addNew = () => {
    const firstTag = allDatasetTags[0];
    if (!firstTag) return;
    setNewRows((prev) => [...prev, { tagId: firstTag._id, value: '', checked: true, isNew: true }]);
  };

  const removeNew = (index: number) => {
    setNewRows((prev) => prev.filter((_, i) => i !== index));
  };

  const { runAsync: onSave, loading } = useRequest(
    async () => {
      // 构建最终标签列表：
      // - existingRows 中 checked 且非 deleteFlag 的行 → 保留并更新值
      // - newRows → 新增
      const tagsToSet: CollectionTagValueType[] = [
        ...existingRows
          .filter((row) => row.checked && !row.deleteFlag)
          .map((row) => {
            const isDatetime = tagMap.get(row.tagId)?.tagType === 'datetime';
            return { tagId: row.tagId, value: isDatetime ? Number(row.value) : row.value };
          }),
        ...newRows.map((row) => {
          const isDatetime = tagMap.get(row.tagId)?.tagType === 'datetime';
          return { tagId: row.tagId, value: isDatetime ? Number(row.value) : row.value };
        })
      ];

      return batchSetCollectionTags({
        collectionIds: selectedCollections.map((c) => c._id),
        tags: tagsToSet,
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
      iconSrc="core/dataset/tag"
      iconColor={'primary.600'}
      title={`${t('dataset:tag.batch_set_tags')}（${selectedCollections.length} ${t('dataset:tag.files')}）`}
      w={'520px'}
    >
      <Box px={6} pt={4} pb={2}>
        {/* 已有标签区域 */}
        {existingRows.length > 0 && (
          <>
            <Text fontSize={'sm'} color={'myGray.600'} mb={2}>
              {t('dataset:tag.existing_tags_tip')}
            </Text>
            {existingRows.map((row, index) => {
              const tagDef = tagMap.get(row.tagId);
              const tagType = tagDef?.tagType || 'string';
              return (
                <HStack key={index} mb={3} spacing={2}>
                  <Checkbox
                    isChecked={row.checked}
                    onChange={(e) => updateExisting(index, 'checked', e.target.checked)}
                  />
                  <Text w={'80px'} fontSize={'sm'} noOfLines={1}>
                    {tagDef?.tag || row.tagId}
                  </Text>
                  <ValueInput
                    tagType={tagType}
                    value={row.value}
                    onChange={(v) => updateExisting(index, 'value', v)}
                    disabled={!row.checked}
                    t={t}
                  />
                  <IconButton
                    aria-label="delete"
                    icon={<MyIcon name={'delete'} w={'0.9rem'} />}
                    variant={'ghost'}
                    size={'sm'}
                    color={row.deleteFlag ? 'red.500' : 'myGray.400'}
                    _hover={{ color: 'red.500' }}
                    onClick={() => updateExisting(index, 'deleteFlag', !row.deleteFlag)}
                  />
                </HStack>
              );
            })}
          </>
        )}

        {/* 新标签区域 */}
        <Text fontSize={'sm'} color={'myGray.600'} mb={2} mt={existingRows.length > 0 ? 3 : 0}>
          {t('dataset:tag.new_tags_tip')}
        </Text>
        <Box
          border={'1.5px dashed'}
          borderColor={'primary.400'}
          borderRadius={'md'}
          p={3}
          minH={'60px'}
        >
          {newRows.map((row, index) => {
            const tagDef = tagMap.get(row.tagId);
            const tagType = tagDef?.tagType || 'string';
            return (
              <HStack key={index} mb={3} spacing={2}>
                <Select
                  w={'160px'}
                  value={row.tagId}
                  onChange={(e) => {
                    updateNew(index, 'tagId', e.target.value);
                    updateNew(index, 'value', '');
                  }}
                  size={'sm'}
                >
                  {allDatasetTags.map((tag) => (
                    <option key={tag._id} value={tag._id}>
                      {tag.tag}
                    </option>
                  ))}
                </Select>
                <ValueInput
                  tagType={tagType}
                  value={row.value}
                  onChange={(v) => updateNew(index, 'value', v)}
                  t={t}
                />
                <IconButton
                  aria-label="delete"
                  icon={<MyIcon name={'delete'} w={'0.9rem'} />}
                  variant={'ghost'}
                  size={'sm'}
                  color={'myGray.400'}
                  _hover={{ color: 'red.500' }}
                  onClick={() => removeNew(index)}
                />
              </HStack>
            );
          })}

          {allDatasetTags.length > 0 && (
            <Flex
              align={'center'}
              color={'primary.600'}
              cursor={'pointer'}
              fontSize={'sm'}
              onClick={addNew}
            >
              <MyIcon name={'common/addLight'} w={'0.9rem'} mr={1} />
              {t('dataset:tag.add_tag')}
            </Flex>
          )}
        </Box>
      </Box>

      <Flex justify={'flex-end'} px={6} pb={5} pt={3} gap={3}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={loading} onClick={onSave}>
          {t('common:Confirm')}
        </Button>
      </Flex>
    </MyModal>
  );
};

export default BatchSetTagsModal;
