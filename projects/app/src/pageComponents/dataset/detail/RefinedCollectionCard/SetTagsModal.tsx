import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  HStack,
  IconButton
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { CollectionPageContext } from '../CollectionCard/Context';
import { setCollectionTags } from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { CollectionTagValueType, DatasetTagType } from '@fastgpt/global/core/dataset/type';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import DateTimePicker from '@fastgpt/web/components/common/DateTimePicker';
import { utcTsToDisplayDate, displayDateToUtcTs } from '@fastgpt/global/common/string/time';

type TagRow = {
  tagId: string;
  value: string;
};

const ValueInput = ({
  tagType,
  value,
  onChange
}: {
  tagType: string;
  value: string;
  onChange: (v: string) => void;
}) => {
  const { t } = useTranslation();
  if (tagType === 'number') {
    return (
      <NumberInput flex={1} value={value} onChange={(v) => onChange(v)} min={undefined}>
        <NumberInputField placeholder="0" />
      </NumberInput>
    );
  }
  if (tagType === 'datetime') {
    // value 存储为 UTC 毫秒时间戳字符串，用 UTC-as-local 技巧使 DateTimePicker 显示 UTC 时间
    const ts = Number(value);
    const dateValue = !isNaN(ts) && ts > 0 ? utcTsToDisplayDate(ts) : null;
    return (
      <Box flex={1}>
        <DateTimePicker
          value={dateValue}
          onChange={(date) => onChange(date ? String(displayDateToUtcTs(date)) : '')}
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
    />
  );
};

const SetTagsModal = ({
  collection,
  onClose
}: {
  collection: DatasetCollectionsListItemType;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { allDatasetTags } = useContextSelector(DatasetPageContext, (v) => v);
  const { getData, pageNum } = useContextSelector(CollectionPageContext, (v) => v);

  // 初始化现有标签：将 collection.tags 转为 TagRow[]
  const initRows = (): TagRow[] => {
    if (!collection.tags || collection.tags.length === 0) return [];
    return collection.tags
      .filter((t) => typeof t === 'object' && t !== null)
      .map((t) => ({
        tagId: (t as CollectionTagValueType).tagId,
        value: String((t as CollectionTagValueType).value)
      }));
  };

  const [rows, setRows] = useState<TagRow[]>(initRows);

  const tagMap = useMemo(
    () => new Map<string, DatasetTagType>(allDatasetTags.map((t) => [t._id, t])),
    [allDatasetTags]
  );

  const addRow = () => {
    const firstTag = allDatasetTags[0];
    if (!firstTag) return;
    setRows((prev) => [...prev, { tagId: firstTag._id, value: '' }]);
  };

  const updateRow = (index: number, field: keyof TagRow, val: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const { runAsync: onSave, loading } = useRequest(
    () =>
      setCollectionTags({
        collectionId: collection._id,
        tags: rows.map((row) => {
          const tagDef = tagMap.get(row.tagId);
          const isDatetime = tagDef?.tagType === 'datetime';
          return {
            tagId: row.tagId,
            value: isDatetime ? Number(row.value) : row.value
          };
        })
      }),
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
      title={t('dataset:tag.set_tags')}
      w={'500px'}
    >
      <Box px={6} pt={4} pb={2}>
        <Box
          border={'1.5px dashed'}
          borderColor={'primary.400'}
          borderRadius={'md'}
          p={4}
          minH={'120px'}
        >
          {rows.map((row, index) => {
            const tagDef = tagMap.get(row.tagId);
            const tagType = tagDef?.tagType || 'string';
            return (
              <HStack key={index} mb={3} spacing={2}>
                <Select
                  w={'160px'}
                  value={row.tagId}
                  onChange={(e) => {
                    updateRow(index, 'tagId', e.target.value);
                    updateRow(index, 'value', '');
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
                  onChange={(v) => updateRow(index, 'value', v)}
                />
                <IconButton
                  aria-label="delete"
                  icon={<MyIcon name={'delete'} w={'0.9rem'} />}
                  variant={'ghost'}
                  size={'sm'}
                  color={'myGray.500'}
                  _hover={{ color: 'red.500' }}
                  onClick={() => removeRow(index)}
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
              onClick={addRow}
              mt={rows.length > 0 ? 1 : 0}
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

export default SetTagsModal;
