import React, { useState, useMemo } from 'react';
import { Box, Flex, Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { CollectionPageContext } from '../CollectionCard/Context';
import { setCollectionTags } from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { CollectionTagValueType } from '@fastgpt/global/core/dataset/type.d';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import TagRowsEditor from './TagRowsEditor';
import TagManageModal from './TagManageModal';

type TagRow = {
  tagId: string;
  value: string;
};

const SetTagsModal = ({
  collection,
  onClose
}: {
  collection: DatasetCollectionsListItemType;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { allDatasetTags, loadAllDatasetTags } = useContextSelector(DatasetPageContext, (v) => v);
  const { getData, pageNum } = useContextSelector(CollectionPageContext, (v) => v);
  const [showTagManageModal, setShowTagManageModal] = useState(false);

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
    () =>
      new Map<string, DatasetTagType>(
        allDatasetTags.map((t) => [t._id, t] as [string, DatasetTagType])
      ),
    [allDatasetTags]
  );

  const allTagOptions = useMemo(
    () => allDatasetTags.map((t) => ({ label: t.tag, value: t._id, tagType: t.tagType })),
    [allDatasetTags]
  );

  const addRow = () => {
    setRows((prev) => [...prev, { tagId: '', value: '' }]);
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
    <>
      <MyModal
        isOpen
        onClose={onClose}
        iconColor={'primary.600'}
        title={
          <Flex align={'center'}>
            {t('dataset:tag.set_tags')}
            <QuestionTip label={t('dataset:tag.manage_tip')} ml={3} />
          </Flex>
        }
        w={'600px'}
        h={'400px'}
      >
        <ModalBody p={8}>
          <TagRowsEditor
            rows={rows}
            allTagOptions={allTagOptions}
            onAddRow={addRow}
            onUpdateRow={updateRow}
            onRemoveRow={removeRow}
            selectFooter={(closeMenu) => (
              <Button
                variant={'whiteBase'}
                w="100%"
                leftIcon={
                  <MyIcon name={'core/dataset/tag' as any} w="12px" h="12px" color="#3E4A59" />
                }
                onClick={() => {
                  closeMenu();
                  setShowTagManageModal(true);
                }}
              >
                {t('dataset:tag.manage')}
              </Button>
            )}
          />
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={loading} isDisabled={rows.some((r) => !r.tagId || r.value === '')} onClick={onSave}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
      {showTagManageModal && (
        <TagManageModal
          onClose={() => {
            setShowTagManageModal(false);
            loadAllDatasetTags();
          }}
        />
      )}
    </>
  );
};

export default SetTagsModal;
