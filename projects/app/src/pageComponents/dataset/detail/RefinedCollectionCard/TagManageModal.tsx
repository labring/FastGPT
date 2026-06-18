import React, { useMemo, useState } from 'react';
import { Button, Flex, Box, ModalFooter, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MySelect from '@fastgpt/web/components/common/MySelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import {
  batchUpsertCollectionTags,
  delDatasetCollectionTag,
  getDatasetCollectionTags
} from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

type PendingTag = { id: string; tag: string; tagType: 'string' | 'number' | 'datetime' };

const TagManageModal = ({ onClose }: { onClose: (refresh?: boolean) => void }) => {
  const { t } = useTranslation();
  const { datasetDetail, loadAllDatasetTags, setSearchTagKey } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  const [pendingNewTags, setPendingNewTags] = useState<PendingTag[]>([]);
  const [deletedTagIds, setDeletedTagIds] = useState<Set<string>>(new Set());

  const { openConfirm: openDeleteConfirm, ConfirmModal: DeleteConfirmModal } = useConfirm({
    type: 'delete',
    content: t('dataset:tag.delete_confirm_tip')
  });

  const { data: collectionTags, refreshList } = useScrollPagination(getDatasetCollectionTags, {
    pageSize: 200,
    params: {
      datasetId: datasetDetail._id,
      searchText: ''
    }
  });

  const displayedTags = collectionTags.filter((tag) => !deletedTagIds.has(tag._id));
  const hasTagRows = displayedTags.length > 0 || pendingNewTags.length > 0;

  const tagTypeOptions = [
    { label: t('dataset:tag.type_string'), value: 'string' },
    { label: t('dataset:tag.type_number'), value: 'number' },
    { label: t('dataset:tag.type_datetime'), value: 'datetime' }
  ];

  const duplicateNewTagNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pt of pendingNewTags) {
      if (pt.tag.trim()) {
        counts.set(pt.tag, (counts.get(pt.tag) || 0) + 1);
      }
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
  }, [pendingNewTags]);

  const existingTagNames = useMemo(() => new Set(displayedTags.map((t) => t.tag)), [displayedTags]);

  const { runAsync: onConfirmSave, loading } = useRequest(
    async () => {
      const existingTags = collectionTags
        .filter((tag) => !deletedTagIds.has(tag._id))
        .map((tag) => ({ tag: tag.tag, tagType: tag.tagType }));

      // 检测新 tag 之间是否有重复
      const newTagNames = pendingNewTags.map((pt) => pt.tag.trim()).filter(Boolean);
      const seen = new Set<string>();
      for (const name of newTagNames) {
        if (seen.has(name)) {
          throw new Error(t('dataset:tag.duplicate_name'));
        }
        seen.add(name);
      }

      // 检测新 tag 是否与已有未删除 tag 重复
      for (const pt of pendingNewTags) {
        if (!pt.tag.trim()) continue;
        if (existingTags.find((et) => et.tag === pt.tag)) {
          throw new Error(t('dataset:tag.duplicate_name'));
        }
      }

      const validNewTags = pendingNewTags
        .filter((pt) => pt.tag.trim())
        .map((pt) => ({ tag: pt.tag, tagType: pt.tagType }));

      await Promise.all(
        [...deletedTagIds].map((id) =>
          delDatasetCollectionTag({ id, datasetId: datasetDetail._id })
        )
      );

      await batchUpsertCollectionTags({
        datasetId: datasetDetail._id,
        tags: [...existingTags, ...validNewTags]
      });
    },
    {
      onSuccess() {
        refreshList();
        setSearchTagKey('');
        loadAllDatasetTags();
        onClose(true);
      },
      successToast: t('common:save_success'),
      errorToast: t('common:save_failed')
    }
  );

  const addTagRow = () => {
    setPendingNewTags((prev) => [...prev, { id: String(Date.now()), tag: '', tagType: 'string' }]);
  };

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        title={
          <Flex align={'center'}>
            {t('dataset:tag.manage')}
            <QuestionTip label={t('dataset:tag.manage_tip')} ml={3} />
          </Flex>
        }
        w={'600px'}
        h={'600px'}
        closeOnOverlayClick={false}
      >
        <>
          <Box flex={'1 0 0'} overflow={'auto'} p={8} display={'flex'} flexDirection={'column'}>
            {!hasTagRows && (
              <Box
                fontSize={'12px'}
                fontWeight={'normal'}
                lineHeight={'16px'}
                color={'#666666'}
                mb={1}
              >
                {t('dataset:tag.manage_desc')}
              </Box>
            )}
            {hasTagRows && (
              <Box mb={1}>
                {displayedTags.map((item, index) => (
                  <Box
                    key={item._id}
                    mb={index < displayedTags.length - 1 || pendingNewTags.length > 0 ? 1 : 0}
                  >
                    <TagRow
                      tag={item.tag}
                      tagType={(item.tagType as 'string' | 'number' | 'datetime') || 'string'}
                      isEditable={false}
                      tagTypeOptions={tagTypeOptions}
                      onDelete={() =>
                        openDeleteConfirm({
                          onConfirm: () => setDeletedTagIds((prev) => new Set([...prev, item._id]))
                        })()
                      }
                    />
                  </Box>
                ))}
                {pendingNewTags.map((pt, index) => (
                  <Box key={pt.id} mb={index < pendingNewTags.length - 1 ? 1 : 0}>
                    <TagRow
                      tag={pt.tag}
                      tagType={pt.tagType}
                      isEditable={true}
                      isDuplicate={duplicateNewTagNames.has(pt.tag) || existingTagNames.has(pt.tag)}
                      tagTypeOptions={tagTypeOptions}
                      onTagChange={(val) =>
                        setPendingNewTags((prev) =>
                          prev.map((item) => (item.id === pt.id ? { ...item, tag: val } : item))
                        )
                      }
                      onTagTypeChange={(val) =>
                        setPendingNewTags((prev) =>
                          prev.map((item) =>
                            item.id === pt.id
                              ? { ...item, tagType: val as 'string' | 'number' | 'datetime' }
                              : item
                          )
                        )
                      }
                      onDelete={() =>
                        setPendingNewTags((prev) => prev.filter((item) => item.id !== pt.id))
                      }
                    />
                  </Box>
                ))}
              </Box>
            )}
            <Button
              variant="link"
              py={2}
              onClick={addTagRow}
              leftIcon={
                <MyIcon name={'common/addLight' as any} w="16px" color="#1770E6" mt="2px" />
              }
              iconSpacing="4px"
              fontSize="12px"
              color="#156AD9"
              fontWeight="normal"
              alignSelf="flex-start"
            >
              {t('dataset:tag.add_tag')}
            </Button>
          </Box>
          <ModalFooter gap={3}>
            <Button variant={'whiteBase'} onClick={() => onClose()}>
              {t('common:Cancel')}
            </Button>
            <Button isLoading={loading} onClick={() => onConfirmSave().catch(() => {})}>
              {t('common:Confirm')}
            </Button>
          </ModalFooter>
        </>
      </MyModal>
      <DeleteConfirmModal />
    </>
  );
};

export default TagManageModal;

type TagRowProps = {
  tag: string;
  tagType: 'string' | 'number' | 'datetime';
  isEditable: boolean;
  isDuplicate?: boolean;
  tagTypeOptions: { label: string; value: string }[];
  onDelete: () => void;
  onTagChange?: (val: string) => void;
  onTagTypeChange?: (val: string) => void;
};

const TagRow = ({
  tag,
  tagType,
  isEditable,
  isDuplicate,
  tagTypeOptions,
  onDelete,
  onTagChange,
  onTagTypeChange
}: TagRowProps) => {
  const { t } = useTranslation();
  return (
    <Flex gap={2} align={'center'}>
      <Input
        value={tag}
        flex={'1'}
        onChange={(e) => onTagChange?.(e.target.value)}
        placeholder={t('dataset:tag.tag_name')}
        borderColor={isDuplicate ? 'red.500' : undefined}
      />
      <MySelect
        w={'130px'}
        value={tagType}
        list={tagTypeOptions}
        onChange={(val) => onTagTypeChange?.(val)}
        isDisabled={!isEditable}
      />
      <MyIconButton icon="delete" hoverColor="red.500" hoverBg="red.50" onClick={onDelete} />
    </Flex>
  );
};
