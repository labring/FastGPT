import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, HStack, Input, useDisclosure } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import {
  postSetCollectionTags,
  updateDatasetCollectionTag
} from '@/web/core/dataset/api/collection';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { type DatasetCollectionsListItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  DatasetCollectionTagTypeEnum,
  type CollectionTagValueType,
  type DatasetTagType
} from '@fastgpt/global/core/dataset/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { TagActionButton, TagTableContainer, TagTableHeader } from './TagCommon';
import {
  ArrayTagSelect,
  DateTimeTagInput,
  NumberTagInput,
  StringTagInput,
  TagNameSelect,
  tagInputBaseStyles
} from './TagValueInputs';
import TagManageModal from './TagManageModal';

const SET_TAG_TABLE_COLUMNS = '200px minmax(0, 1fr) 100px';

type TagRowType = {
  id: string;
  tagId: string;
  value: string | number | string[];
};

type CollectionTagSetModalProps = {
  collection: DatasetCollectionsListItemType;
  onClose: () => void;
  onSuccess?: () => void;
};

const createEmptyTagRow = (): TagRowType => ({
  id: getNanoid(),
  tagId: '',
  value: ''
});

/** 行数据是否已选标签且填了对应类型的值，用于禁用「添加」和底部确定。 */
const isTagRowComplete = (row: TagRowType, tags: DatasetTagType[]) => {
  if (!row.tagId) return false;
  const tagDoc = tags.find((tag) => String(tag._id) === row.tagId);
  if (!tagDoc) return false;

  const tagType = tagDoc.tagType ?? DatasetCollectionTagTypeEnum.string;
  if (tagType === DatasetCollectionTagTypeEnum.string) {
    return typeof row.value === 'string' && row.value.trim().length > 0;
  }
  if (
    tagType === DatasetCollectionTagTypeEnum.number ||
    tagType === DatasetCollectionTagTypeEnum.datetime
  ) {
    return typeof row.value === 'number' && Number.isFinite(row.value);
  }
  if (tagType === DatasetCollectionTagTypeEnum.array) {
    return Array.isArray(row.value) && row.value.length > 0;
  }
  return false;
};

const CollectionTagSetModal = ({ collection, onClose, onSuccess }: CollectionTagSetModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { datasetDetail, allDatasetTags, isLoadingAllDatasetTags, loadAllDatasetTags } =
    useContextSelector(DatasetPageContext, (v) => v);
  const {
    isOpen: isTagManageOpen,
    onOpen: onOpenTagManage,
    onClose: onCloseTagManage
  } = useDisclosure();

  const initialRows = useMemo<TagRowType[]>(() => {
    const rows: TagRowType[] = [];

    for (const item of collection.tags ?? []) {
      const tagNameOrId = typeof item === 'string' ? item : item.tag;
      const tagDoc = allDatasetTags.find(
        (tag) => tag.tag === tagNameOrId || String(tag._id) === tagNameOrId
      );
      if (!tagDoc) continue;

      const value = (() => {
        if (typeof item !== 'string') return item.value;
        return tagDoc.tagType === DatasetCollectionTagTypeEnum.array ? [item] : item;
      })();

      rows.push({
        id: getNanoid(),
        tagId: String(tagDoc._id),
        value
      });
    }

    return rows.length > 0 ? rows : [createEmptyTagRow()];
  }, [collection.tags, allDatasetTags]);

  // 标签定义异步加载时先使用计算值，避免空列表把已有集合标签初始化丢失。
  const [draftRows, setDraftRows] = useState<TagRowType[]>();
  const rows = draftRows ?? initialRows;

  const { runAsync: onSaveTags, loading: isSaving } = useRequest(
    (tags: CollectionTagValueType[]) =>
      postSetCollectionTags({
        datasetId: datasetDetail._id,
        collectionId: collection._id,
        tags
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

  const { runAsync: onAppendTagOption } = useRequest(
    ({ tagId, option }: { tagId: string; option: string }) => {
      const tag = allDatasetTags.find((item) => String(item._id) === tagId);
      if (!tag) return Promise.resolve();

      const nextOptions = [...new Set([...(tag.options ?? []), option.trim()].filter(Boolean))];
      if (nextOptions.length === (tag.options ?? []).length) {
        return Promise.resolve();
      }
      return updateDatasetCollectionTag({
        datasetId: datasetDetail._id,
        tagId: tag._id,
        tag: tag.tag,
        options: nextOptions
      });
    },
    {
      refreshDeps: [datasetDetail._id, allDatasetTags],
      onSuccess: loadAllDatasetTags,
      errorToast: t('dataset:tag.save_failed')
    }
  );

  const hasIncompleteRow = useMemo(
    () => rows.some((row) => !isTagRowComplete(row, allDatasetTags)),
    [rows, allDatasetTags]
  );

  const isAddDisabled =
    hasIncompleteRow || allDatasetTags.length === 0 || rows.length >= allDatasetTags.length;
  const isConfirmDisabled = hasIncompleteRow || isSaving;

  const updateRows = (updater: (current: TagRowType[]) => TagRowType[]) => {
    setDraftRows((prev) => updater(prev ?? rows));
  };

  const handleAddRow = () => {
    if (isAddDisabled) return;
    updateRows((current) => [...current, createEmptyTagRow()]);
  };

  const handleDeleteRow = (id: string) => {
    updateRows((current) => current.filter((row) => row.id !== id));
    toast({
      title: t('dataset:tag.delete_success'),
      status: 'success'
    });
  };

  const handleTagChange = (rowId: string, newTagId: string) => {
    const tagDoc = allDatasetTags.find((tag) => String(tag._id) === newTagId);
    updateRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              tagId: newTagId,
              value: tagDoc?.tagType === DatasetCollectionTagTypeEnum.array ? [] : ''
            }
          : row
      )
    );
  };

  const handleValueChange = (rowId: string, value: string | number | string[]) => {
    updateRows((current) => current.map((row) => (row.id === rowId ? { ...row, value } : row)));
  };

  const getRowTagOptions = (currentRowId: string) => {
    const otherSelectedTagIds = new Set(
      rows.filter((r) => r.id !== currentRowId && Boolean(r.tagId)).map((r) => r.tagId)
    );

    return allDatasetTags
      .filter((tag) => !otherSelectedTagIds.has(String(tag._id)))
      .map((tag) => ({
        label: tag.tag,
        value: String(tag._id)
      }));
  };

  const handleSubmit = async () => {
    if (isConfirmDisabled) return;

    await onSaveTags(rows.map((row) => ({ tagId: row.tagId, value: row.value })));
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
          <Flex alignItems={'center'} gap={1}>
            <Box>{t('dataset:tag.setting_title')}</Box>
            <QuestionTip
              label={t('dataset:tag.setting_tip')}
              w={'20px'}
              h={'20px'}
              color={'myGray.600'}
            />
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
              h={'36px'}
              px={'14px'}
              variant={'primaryOutline'}
              color={'primary.700'}
              leftIcon={<MyIcon name={'common/addLight'} w={'18px'} h={'18px'} />}
              isDisabled={isAddDisabled}
              onClick={handleAddRow}
            >
              {t('dataset:tag.add_tag')}
            </Button>

            <HStack spacing={3}>
              <Button w={'64px'} h={'36px'} variant={'whiteBase'} onClick={onClose}>
                {t('common:Close')}
              </Button>
              <Button
                w={'64px'}
                h={'36px'}
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
        <TagTableContainer>
          <TagTableHeader columns={SET_TAG_TABLE_COLUMNS}>
            <Box px={6}>{t('dataset:tag.name')}</Box>
            <Box px={6}>{t('dataset:tag.value')}</Box>
            <Box px={6}>{t('common:Operation')}</Box>
          </TagTableHeader>

          <Box
            flex={'1 1 auto'}
            minH={0}
            overflowY={'auto'}
            display={'flex'}
            flexDirection={'column'}
            fontSize={'sm'}
            lineHeight={'20px'}
            color={'myGray.600'}
          >
            {rows.length === 0 ? (
              <EmptyTip text={t('dataset:dataset.no_tags')} />
            ) : (
              rows.map((row) => {
                const selectedTag = allDatasetTags.find((tag) => String(tag._id) === row.tagId);
                const currentTagOptions = getRowTagOptions(row.id);

                return (
                  <Box
                    key={row.id}
                    display={'grid'}
                    gridTemplateColumns={SET_TAG_TABLE_COLUMNS}
                    alignItems={'center'}
                    h={'80px'}
                    flexShrink={0}
                    borderBottom={'1px solid'}
                    borderColor={'myGray.150'}
                  >
                    <Box px={6} minW={0}>
                      <TagNameSelect
                        value={row.tagId}
                        options={currentTagOptions}
                        onChange={(newTagId) => handleTagChange(row.id, newTagId)}
                        onManage={onOpenTagManage}
                      />
                    </Box>

                    <Box px={6} minW={0}>
                      {!selectedTag ? (
                        <Input
                          {...tagInputBaseStyles}
                          isDisabled
                          placeholder={t('dataset:tag.fill_value')}
                        />
                      ) : selectedTag.tagType === DatasetCollectionTagTypeEnum.number ? (
                        <NumberTagInput
                          value={row.value as number}
                          onChange={(val) => handleValueChange(row.id, val)}
                        />
                      ) : selectedTag.tagType === DatasetCollectionTagTypeEnum.datetime ? (
                        <DateTimeTagInput
                          value={row.value as number}
                          onChange={(val) => handleValueChange(row.id, val)}
                        />
                      ) : selectedTag.tagType === DatasetCollectionTagTypeEnum.array ? (
                        <ArrayTagSelect
                          options={selectedTag.options ?? []}
                          value={
                            Array.isArray(row.value)
                              ? row.value
                              : row.value
                                ? [String(row.value)]
                                : []
                          }
                          onChange={(val) => handleValueChange(row.id, val)}
                          onCreateOption={(option) => {
                            void onAppendTagOption({ tagId: String(selectedTag._id), option });
                          }}
                        />
                      ) : (
                        <StringTagInput
                          value={
                            typeof row.value === 'string' ? row.value : String(row.value ?? '')
                          }
                          onChange={(val) => handleValueChange(row.id, val)}
                        />
                      )}
                    </Box>

                    <Flex px={6} alignItems={'center'}>
                      <TagActionButton
                        label={t('common:Delete')}
                        icon={<MyIcon name={'delete'} w={'16px'} h={'16px'} />}
                        hoverColor={'red.600'}
                        onClick={() => handleDeleteRow(row.id)}
                      />
                    </Flex>
                  </Box>
                );
              })
            )}
          </Box>
        </TagTableContainer>
      </MyModal>
      {isTagManageOpen && <TagManageModal onClose={onCloseTagManage} />}
    </>
  );
};

export default React.memo(CollectionTagSetModal);
