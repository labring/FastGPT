import React, { useMemo, useState } from 'react';
import { Box, Card, Flex, IconButton, Button, VStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { TabEnum } from '../NavBar';
import { useRouter } from 'next/router';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import MyInput from '@/components/MyInput';
import { useTranslation } from 'next-i18next';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import {
  getDatasetDataList,
  getDatasetDataItemById,
  putDatasetDataById
} from '@/web/core/dataset/api';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import Markdown from '@/components/Markdown';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { getTextValidLength } from '@fastgpt/global/common/string/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useMemoizedFn } from 'ahooks';
import { delOneDatasetDataById, getDatasetCollectionById } from '@/web/core/dataset/api';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import ContentIndexCard from './ContentIndexCard';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type {
  DatasetDataItemType,
  DatasetDataIndexItemType
} from '@fastgpt/global/core/dataset/type';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import EditContentModal from './EditContentModal';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

const RefinedDataCard = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();

  const { collectionId = '' } = router.query as {
    collectionId: string;
    datasetId: string;
  };

  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);

  const [searchText, setSearchText] = useState('');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeDataDetail, setActiveDataDetail] = useState<DatasetDataItemType | null>(null);
  const [isAddingNewIndex, setIsAddingNewIndex] = useState(false);
  const [newIndexText, setNewIndexText] = useState('');
  const [editingDataId, setEditingDataId] = useState<string | null>(null);
  const [foldedCards, setFoldedCards] = useState<Record<string, boolean>>({});

  const canWrite = useMemo(() => datasetDetail.permission.hasWritePer, [datasetDetail]);

  // Filter out default type indexes
  const filteredIndexes = useMemo(() => {
    if (!activeDataDetail?.indexes) return [];
    return activeDataDetail.indexes.filter((index) => index.type !== 'default');
  }, [activeDataDetail?.indexes]);

  // Get collection info
  const { data: collection, runAsync: reloadCollection } = useRequest2(
    () => getDatasetCollectionById(collectionId),
    {
      refreshDeps: [collectionId],
      manual: false,
      onError: () => {
        router.replace({
          query: {
            datasetId
          }
        });
      }
    }
  );

  // Fetch active card detail
  const { runAsync: fetchActiveDataDetail, loading: isLoadingDetail } = useRequest2(
    async (dataId: string) => {
      const detail = await getDatasetDataItemById(dataId);
      setActiveDataDetail(detail);
      return detail;
    },
    {
      manual: true
    }
  );

  // Handle active card change
  const handleCardClick = useMemoizedFn((dataId: string) => {
    if (activeCardId === dataId) return;
    setActiveCardId(dataId);
    setIsAddingNewIndex(false);
    setNewIndexText('');
    fetchActiveDataDetail(dataId);
  });

  // Handle card fold/unfold
  const handleToggleFold = useMemoizedFn((dataId: string, e: React.MouseEvent) => {
    setFoldedCards((prev) => ({
      ...prev,
      [dataId]: !prev[dataId]
    }));
  });

  // Handle add new index
  const handleAddNewIndex = useMemoizedFn(() => {
    setIsAddingNewIndex(true);
    setNewIndexText('');
  });

  // Handle save new index
  const { runAsync: saveNewIndex, loading: isSavingNewIndex } = useRequest2(
    async (content: string) => {
      if (!activeDataDetail || !content.trim()) return;

      const newIndexes = [
        ...(activeDataDetail.indexes || []),
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: content.trim(),
          dataId: undefined
        }
      ];

      await putDatasetDataById({
        dataId: activeDataDetail.id,
        q: activeDataDetail.q,
        a: activeDataDetail.a || '',
        indexes: newIndexes
      });

      // Refresh active data detail
      await fetchActiveDataDetail(activeDataDetail.id);
    },
    {
      successToast: t('common:dataset.data.Update Success Tip'),
      onError(err) {
        toast({
          title: getErrText(err),
          status: 'error'
        });
      }
    }
  );

  const handleSaveNewIndex = useMemoizedFn(() => {
    if (!newIndexText.trim()) {
      setIsAddingNewIndex(false);
      return;
    }
    saveNewIndex(newIndexText).then(() => {
      setIsAddingNewIndex(false);
      setNewIndexText('');
    });
  });

  // Handle new index content change (for auto-save on blur)
  const handleNewIndexContentChange = useMemoizedFn((content: string) => {
    setNewIndexText(content);
    // Auto-save when content is not empty
    if (content.trim()) {
      saveNewIndex(content).then(() => {
        setIsAddingNewIndex(false);
        setNewIndexText('');
      });
    } else {
      // If empty, just cancel adding
      setIsAddingNewIndex(false);
      setNewIndexText('');
    }
  });

  // Handle cancel new index
  const handleCancelNewIndex = useMemoizedFn(() => {
    setIsAddingNewIndex(false);
    setNewIndexText('');
  });

  const EmptyTipDom = useMemo(
    () => <EmptyTip text={t('common:core.dataset.data.Empty Tip')} />,
    [t]
  );

  const {
    data: datasetDataList,
    total,
    Pagination,
    getData: fetchData,
    setData: setDatasetDataList,
    isLoading
  } = usePagination(getDatasetDataList, {
    defaultPageSize: 10,
    pageSizeOptions: [10, 20, 50, 100],
    params: {
      collectionId,
      searchText
    },
    refreshDeps: [searchText, collectionId],
    EmptyTip: EmptyTipDom
  });

  // Initialize active card to first item when data loads
  React.useEffect(() => {
    if (datasetDataList.length > 0 && activeCardId === null) {
      const firstId = datasetDataList[0]._id;
      setActiveCardId(firstId);
      fetchActiveDataDetail(firstId);
    }
    // If the active card was deleted, switch to the first available card
    if (
      datasetDataList.length > 0 &&
      activeCardId !== null &&
      !datasetDataList.find((item) => item._id === activeCardId)
    ) {
      const firstId = datasetDataList[0]._id;
      setActiveCardId(firstId);
      fetchActiveDataDetail(firstId);
    }
    // If no data left, clear active card
    if (datasetDataList.length === 0) {
      setActiveCardId(null);
      setActiveDataDetail(null);
    }
  }, [datasetDataList, activeCardId, fetchActiveDataDetail]);

  const onDeleteOneData = useMemoizedFn(async (dataId: string) => {
    try {
      await delOneDatasetDataById(dataId);
      setDatasetDataList((prev) => {
        return prev.filter((data) => data._id !== dataId);
      });
      toast({
        title: t('common:delete_success'),
        status: 'success'
      });
    } catch (error) {
      toast({
        title: getErrText(error),
        status: 'error'
      });
    }
  });

  // Handle edit index
  const { runAsync: editIndex, loading: isEditingIndex } = useRequest2(
    async (index: DatasetDataIndexItemType, newContent: string) => {
      if (!activeDataDetail || !newContent.trim()) return;

      const updatedIndexes = activeDataDetail.indexes.map((item) =>
        item.dataId === index.dataId ? { ...item, text: newContent.trim() } : item
      );

      await putDatasetDataById({
        dataId: activeDataDetail.id,
        q: activeDataDetail.q,
        a: activeDataDetail.a || '',
        indexes: updatedIndexes
      });

      // Refresh active data detail
      await fetchActiveDataDetail(activeDataDetail.id);
    },
    {
      successToast: t('common:dataset.data.Update Success Tip'),
      onError(err) {
        toast({
          title: getErrText(err),
          status: 'error'
        });
      }
    }
  );

  const handleEditIndex = useMemoizedFn((index: DatasetDataIndexItemType, newContent: string) => {
    editIndex(index, newContent);
  });

  // Handle delete index
  const { runAsync: deleteIndex, loading: isDeletingIndex } = useRequest2(
    async (index: DatasetDataIndexItemType) => {
      if (!activeDataDetail) return;

      const updatedIndexes = activeDataDetail.indexes.filter(
        (item) => item.dataId !== index.dataId
      );

      await putDatasetDataById({
        dataId: activeDataDetail.id,
        q: activeDataDetail.q,
        a: activeDataDetail.a || '',
        indexes: updatedIndexes
      });

      // Refresh active data detail
      await fetchActiveDataDetail(activeDataDetail.id);
    },
    {
      successToast: t('common:delete_success'),
      onError(err) {
        toast({
          title: getErrText(err),
          status: 'error'
        });
      }
    }
  );

  const handleDeleteIndex = useMemoizedFn((index: DatasetDataIndexItemType) => {
    deleteIndex(index);
  });

  // Get editing data detail
  const editingData = useMemo(() => {
    if (!editingDataId) return null;
    return datasetDataList.find((item) => item._id === editingDataId);
  }, [editingDataId, datasetDataList]);

  return (
    <MyBox p={4} h={'100%'}>
      <Flex flexDirection={'column'} h={'100%'}>
        {/* Back Button */}
        <Flex
          alignItems={'center'}
          cursor={'pointer'}
          py={'0.38rem'}
          pr={2}
          ml={0}
          borderRadius={'md'}
          _hover={{ bg: 'myGray.05' }}
          fontSize={'sm'}
          fontWeight={500}
          w={'fit-content'}
          onClick={() => {
            router.replace({
              query: {
                datasetId: router.query.datasetId,
                parentId: router.query.parentId,
                currentTab: TabEnum.collectionCard
              }
            });
          }}
        >
          <IconButton
            p={2}
            mr={2}
            border={'1px solid'}
            borderColor={'myGray.200'}
            boxShadow={'1'}
            icon={<MyIcon name={'common/arrowLeft'} w={'16px'} color={'myGray.500'} />}
            bg={'white'}
            size={'xsSquare'}
            borderRadius={'50%'}
            aria-label={''}
            _hover={'none'}
          />
          <Box fontWeight={500} color={'myGray.600'} fontSize={'sm'}>
            {collection?.sourceName || ''}
          </Box>
        </Flex>

        {/* Main Content Container */}
        <Flex gap={0} alignItems={'stretch'} h={'100%'}>
          {/* Left Side - Data List */}
          <MyBox flex={1} mt={4} overflow={'hidden'}>
            <Flex flexDirection={'column'} h={'100%'}>
              {/* Search Bar and Info */}
              <Flex alignItems={'center'} pb={4}>
                <Box as={'span'} fontSize={'sm'} fontWeight={'500'} color={'myGray.900'}>
                  {collection?.trainingType === DatasetCollectionDataProcessModeEnum.template
                    ? t('dataset:faq_total', { total })
                    : t('dataset:chunk_total', { total })}
                </Box>
                <Box flex={1} mr={1} />
                <MyInput
                  leftIcon={
                    <MyIcon
                      name="common/searchLight"
                      position={'absolute'}
                      w={'14px'}
                      color={'myGray.600'}
                    />
                  }
                  borderColor={'myGray.200'}
                  color={'myGray.500'}
                  w={'200px'}
                  placeholder={t('dataset:search')}
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                  }}
                />
              </Flex>

              {/* Data List */}
              <MyBox
                flex={1}
                overflow={'auto'}
                isLoading={isLoading && datasetDataList.length === 0}
              >
                {datasetDataList.length === 0 ? (
                  !isLoading && EmptyTipDom
                ) : (
                  <Flex flexDir={'column'} gap={2}>
                    {datasetDataList.map((item, index) => {
                      const isFolded =
                        foldedCards[item._id] !== undefined ? foldedCards[item._id] : true;
                      return (
                        <Card
                          key={item._id}
                          p={3}
                          userSelect={'none'}
                          border={'sm'}
                          position={'relative'}
                          overflow={'hidden'}
                          bg={activeCardId === item._id ? 'primary.50' : 'transparent'}
                          borderColor={activeCardId === item._id ? 'blue.600' : 'inherit'}
                          boxShadow={activeCardId === item._id ? 'lg' : 'none'}
                          _hover={{
                            bg: 'primary.50',
                            borderColor: 'blue.600',
                            boxShadow: 'lg',
                            '& .footer': { visibility: 'visible' }
                          }}
                          onClick={() => handleCardClick(item._id)}
                        >
                          {/* Header - 序号和字符数 */}
                          <MyTooltip
                            label={isFolded ? t('dataset:expand_all') : t('dataset:collapse')}
                          >
                            <Flex
                              alignItems={'center'}
                              h={'24px'}
                              mb={2}
                              cursor={'pointer'}
                              borderRadius={'sm'}
                              _hover={{
                                bg: 'rgba(206, 221, 255, 0.3)'
                              }}
                              onClick={(e) => handleToggleFold(item._id, e)}
                            >
                              <Box color={'myGray.500'} fontSize={'xs'} fontWeight={500}>
                                #{item.chunkIndex ?? '-'}
                              </Box>
                              <Box ml={3} color={'myGray.500'} fontSize={'xs'} fontWeight={500}>
                                {item.imageSize ? (
                                  <>{formatFileSize(item.imageSize)}</>
                                ) : (
                                  <>{getTextValidLength((item?.q || '') + (item?.a || ''))} 字符</>
                                )}
                              </Box>
                              <Box flex={1} />
                              <MyIcon
                                name={isFolded ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
                                w={'14px'}
                                color={'myGray.500'}
                              />
                            </Flex>
                          </MyTooltip>

                          {/* Data content */}
                          <Box
                            {...(isFolded
                              ? {
                                  maxH: '67px',
                                  overflow: 'hidden'
                                }
                              : {
                                  maxH: 'auto'
                                })}
                          >
                            {item.imagePreviewUrl ? (
                              <Box display={['block', 'flex']} alignItems={'center'} gap={[3, 6]}>
                                <Box flex="1 0 0">
                                  <MyImage
                                    src={item.imagePreviewUrl}
                                    alt={''}
                                    w={'100%'}
                                    h="100%"
                                    maxH={'300px'}
                                    objectFit="contain"
                                  />
                                </Box>
                                <Box flex="1 0 0" maxH={'300px'} overflow={'hidden'} fontSize="sm">
                                  <Markdown source={item.q} isDisabled />
                                </Box>
                              </Box>
                            ) : (
                              <Box wordBreak={'break-all'}>
                                {!!item.a ? (
                                  <>
                                    <Box
                                      fontSize={'sm'}
                                      fontWeight={500}
                                      lineHeight={'20px'}
                                      color={'myGray.900'}
                                    >
                                      <Markdown source={item.q} isDisabled />
                                    </Box>
                                    <MyDivider my={2} h={'1px'} />
                                    <Box fontSize={'xs'} lineHeight={'20px'} color={'myGray.500'}>
                                      <Markdown source={item.a} isDisabled />
                                    </Box>
                                  </>
                                ) : (
                                  <Box fontSize={'sm'}>
                                    <Markdown source={item.q} isDisabled />
                                  </Box>
                                )}
                              </Box>
                            )}
                          </Box>

                          {/* Footer - 编辑和删除按钮 */}
                          {canWrite && (
                            <Flex
                              className="footer"
                              position={'absolute'}
                              bottom={2}
                              right={2}
                              overflow={'hidden'}
                              alignItems={'center'}
                              visibility={activeCardId === item._id ? 'visible' : 'hidden'}
                              gap={2}
                            >
                              <IconButton
                                display={'flex'}
                                p={1}
                                boxShadow={'1'}
                                icon={<MyIcon name={'edit'} w={'14px'} />}
                                variant={'whiteBase'}
                                size={'xsSquare'}
                                aria-label={'edit'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingDataId(item._id);
                                }}
                              />
                              <PopoverConfirm
                                Trigger={
                                  <IconButton
                                    display={'flex'}
                                    p={1}
                                    boxShadow={'1'}
                                    icon={<MyIcon name={'common/trash'} w={'14px'} />}
                                    variant={'whiteDanger'}
                                    size={'xsSquare'}
                                    aria-label={'delete'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                  />
                                }
                                content={
                                  collection?.trainingType ===
                                  DatasetCollectionDataProcessModeEnum.template
                                    ? t('dataset:confirm_delete_faq')
                                    : t('dataset:confirm_delete_chunk')
                                }
                                type="delete"
                                onConfirm={() => onDeleteOneData(item._id)}
                              />
                            </Flex>
                          )}
                        </Card>
                      );
                    })}
                  </Flex>
                )}
              </MyBox>

              {/* Pagination */}
              {total > 0 && (
                <Box pt={4}>
                  <Pagination />
                </Box>
              )}
            </Flex>
          </MyBox>

          {/* Vertical Divider */}
          <MyDivider orientation={'vertical'} mx={4} my={0} h={'100%'} />

          {/* Right Side - Index Content */}
          <MyBox w={'470px'} flexShrink={0} mt={4} isLoading={isLoadingDetail}>
            {activeDataDetail && (
              <Flex flexDirection={'column'} h={'100%'}>
                {/* Header */}
                <Flex alignItems={'center'} justifyContent={'space-between'} mb={4}>
                  <FormLabel fontWeight={'500'} mb={0}>
                    {t('dataset:content_index_total', { total: filteredIndexes.length })}
                  </FormLabel>
                  {canWrite && (
                    <Button
                      variant={'whiteBase'}
                      size={'md'}
                      onClick={handleAddNewIndex}
                      isDisabled={isAddingNewIndex || isSavingNewIndex}
                      isLoading={isSavingNewIndex}
                    >
                      {t('dataset:add_index')}
                    </Button>
                  )}
                </Flex>

                {/* Index List */}
                <VStack spacing={3} align={'stretch'} flex={1} overflow={'auto'}>
                  {/* New Index Input */}
                  {isAddingNewIndex && (
                    <ContentIndexCard
                      content={newIndexText}
                      isNew={true}
                      onEdit={handleNewIndexContentChange}
                      onCancel={handleCancelNewIndex}
                      isLoading={isSavingNewIndex}
                    />
                  )}

                  {/* Existing Indexes */}
                  {filteredIndexes.length > 0
                    ? filteredIndexes.map((index, i) => (
                        <ContentIndexCard
                          key={index.dataId || i}
                          content={index.text}
                          onEdit={(newContent) => {
                            handleEditIndex(index, newContent);
                          }}
                          onDelete={() => {
                            handleDeleteIndex(index);
                          }}
                        />
                      ))
                    : !isAddingNewIndex && (
                        <Flex alignItems={'center'} justifyContent={'center'} h={'100%'}>
                          <EmptyTip text={t('dataset:no_indexes')} />
                        </Flex>
                      )}
                </VStack>
              </Flex>
            )}
          </MyBox>
        </Flex>
      </Flex>

      {/* Edit Content Modal */}
      {editingDataId && editingData && (
        <EditContentModal
          dataId={editingDataId}
          defaultValue={{
            q: editingData.q,
            a: editingData.a
          }}
          trainingType={collection?.trainingType}
          onClose={() => setEditingDataId(null)}
          onSuccess={(data) => {
            // Update local data
            setDatasetDataList((prev) => {
              return prev.map((item) => {
                if (item._id === editingDataId) {
                  return {
                    ...item,
                    q: data.q,
                    a: data.a || ''
                  };
                }
                return item;
              });
            });
            // Refresh active data detail if it's the same item
            if (activeCardId === editingDataId) {
              fetchActiveDataDetail(editingDataId);
            }
          }}
        />
      )}
    </MyBox>
  );
};

export default React.memo(RefinedDataCard);
