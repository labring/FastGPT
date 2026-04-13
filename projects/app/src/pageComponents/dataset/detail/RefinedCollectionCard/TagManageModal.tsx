import React, { useState } from 'react';
import { Input, Button, Flex, Box, Select, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { batchUpsertCollectionTags, getDatasetCollectionTags } from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyInput from '@/components/MyInput';
import { type DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

type PendingTag = { tag: string; tagType: 'string' | 'number' | 'datetime' };

const TagManageModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { datasetDetail, loadAllDatasetTags, setSearchTagKey } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  const [pendingNewTags, setPendingNewTags] = useState<PendingTag[]>([]);
  const [deletedTagIds, setDeletedTagIds] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');

  // Tags list
  const {
    data: collectionTags,
    ScrollData,
    refreshList,
    total: tagsTotal
  } = useScrollPagination(getDatasetCollectionTags, {
    pageSize: 200,
    params: {
      datasetId: datasetDetail._id,
      searchText
    },
    refreshDeps: [searchText],
    EmptyTip: <EmptyTip text={t('dataset:dataset.no_tags')} />
  });

  const { runAsync: onConfirm, loading } = useRequest(
    async () => {
      const existingTags = collectionTags
        .filter((t) => !deletedTagIds.has(t._id))
        .map((t) => ({ tag: t.tag, tagType: t.tagType }));

      const validNewTags = pendingNewTags
        .filter((pt) => pt.tag.trim() && !existingTags.find((et) => et.tag === pt.tag))
        .map((pt) => ({ tag: pt.tag, tagType: pt.tagType }));

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
        onClose();
      },
      successToast: t('common:save_success'),
      errorToast: t('common:save_failed')
    }
  );

  const displayedTags = collectionTags.filter((t) => !deletedTagIds.has(t._id));

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="core/dataset/tag"
      iconColor={'primary.600'}
      title={t('dataset:tag.manage')}
      w={'580px'}
      h={'600px'}
      closeOnOverlayClick={false}
    >
      <>
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
            {t('dataset:tag.total_tags', {
              total: tagsTotal
            })}
          </Box>
          <MyInput
            placeholder={t('common:Search')}
            w={'160px'}
            h={8}
            onChange={(e) => {
              setSearchText(e.target.value);
            }}
          />
        </Flex>
        <ScrollData px={8} flex={'1 0 0'} fontSize={'sm'} pb={2}>
          {displayedTags.map((item) => (
            <TagRow
              key={item._id}
              item={item}
              onDelete={() => setDeletedTagIds((prev) => new Set([...prev, item._id]))}
              t={t}
            />
          ))}
          {pendingNewTags.map((pt, index) => (
            <Flex key={index} py={3} borderBottom={'1px solid #E8EBF0'} gap={2} align={'center'}>
              <Input
                placeholder={t('dataset:tag.Add_new_tag')}
                value={pt.tag}
                onChange={(e) =>
                  setPendingNewTags((prev) =>
                    prev.map((item, i) => (i === index ? { ...item, tag: e.target.value } : item))
                  )
                }
                flex={'1'}
              />
              <Select
                w={'130px'}
                size={'sm'}
                value={pt.tagType}
                onChange={(e) =>
                  setPendingNewTags((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, tagType: e.target.value as any } : item
                    )
                  )
                }
              >
                <option value="string">{t('dataset:tag.type_string')}</option>
                <option value="number">{t('dataset:tag.type_number')}</option>
                <option value="datetime">{t('dataset:tag.type_datetime')}</option>
              </Select>
              <Box
                p={1}
                cursor={'pointer'}
                _hover={{ bg: '#1118240D' }}
                borderRadius={'sm'}
                onClick={() => setPendingNewTags((prev) => prev.filter((_, i) => i !== index))}
              >
                <MyIcon name="delete" w={4} />
              </Box>
            </Flex>
          ))}
        </ScrollData>
        {/* 添加标签按钮 */}
        <Flex
          px={8}
          py={3}
          cursor={'pointer'}
          color={'primary.600'}
          fontSize={'sm'}
          alignItems={'center'}
          gap={1}
          _hover={{ color: 'primary.700' }}
          onClick={() => setPendingNewTags((prev) => [...prev, { tag: '', tagType: 'string' }])}
        >
          <MyIcon name="common/addLight" w={4} />
          {t('dataset:tag.add_new')}
        </Flex>
        <ModalFooter borderTop={'1px solid #E8EBF0'} gap={3}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={loading} onClick={onConfirm}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </>
    </MyModal>
  );
};

export default TagManageModal;

const TagRow = ({
  item,
  onDelete,
  t
}: {
  item: DatasetTagType;
  onDelete: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}) => {
  return (
    <Flex py={3} borderBottom={'1px solid #E8EBF0'} gap={2} align={'center'}>
      <Input value={item.tag} isReadOnly flex={'1'} />
      <Select w={'130px'} size={'sm'} value={item.tagType || 'string'} isReadOnly>
        <option value="string">{t('dataset:tag.type_string')}</option>
        <option value="number">{t('dataset:tag.type_number')}</option>
        <option value="datetime">{t('dataset:tag.type_datetime')}</option>
      </Select>
      <Box
        p={1}
        cursor={'pointer'}
        _hover={{ bg: '#1118240D' }}
        borderRadius={'sm'}
        onClick={onDelete}
      >
        <MyIcon name="delete" w={4} />
      </Box>
    </Flex>
  );
};
