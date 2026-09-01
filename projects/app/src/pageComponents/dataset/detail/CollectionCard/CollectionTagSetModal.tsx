import React, { useMemo } from 'react';
import { Box, Button, Flex, HStack, useDisclosure } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { postSetCollectionTags } from '@/web/core/dataset/api/collection';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { type DatasetCollectionsListItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { type CollectionTagValueType } from '@fastgpt/global/core/dataset/type';
import TagManageModal from './TagManageModal';
import { useAppendDatasetTagOption } from './useAppendDatasetTagOption';
import { useCollectionTagRows } from './useCollectionTagRows';
import { CollectionTagTable } from './CollectionTagTable';
import { collectionTagsToRows, createEmptyTagRow } from './tagForm';

type CollectionTagSetModalProps = {
  collection: DatasetCollectionsListItemType;
  onClose: () => void;
  onSuccess?: () => void;
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

  const initialRows = useMemo(
    () => collectionTagsToRows(collection.tags, allDatasetTags),
    [collection.tags, allDatasetTags]
  );

  const {
    rows,
    hasIncompleteRow,
    isAddDisabled,
    handleAddRow,
    handleDeleteRow,
    handleTagChange,
    handleValueChange
  } = useCollectionTagRows({
    tags: allDatasetTags,
    initialRows,
    createRow: createEmptyTagRow,
    onRowDeleted: () => {
      toast({
        title: t('dataset:tag.delete_success'),
        status: 'success'
      });
    }
  });

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

  const { runAsync: onAppendTagOption } = useAppendDatasetTagOption();

  const isConfirmDisabled = hasIncompleteRow || isSaving;

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
        />
      </MyModal>
      {isTagManageOpen && <TagManageModal onClose={onCloseTagManage} />}
    </>
  );
};

export default React.memo(CollectionTagSetModal);
