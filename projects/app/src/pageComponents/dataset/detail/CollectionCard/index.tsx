import React, { useState, useRef, useMemo } from 'react';
import {
  Box,
  Flex,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  MenuButton,
  Switch,
  Checkbox,
  HStack,
  Button
} from '@chakra-ui/react';
import {
  delDatasetCollectionById,
  putDatasetCollectionById,
  postLinkCollectionSync
} from '@/web/core/dataset/api/collection';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import {
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  DatasetCollectionSyncResultMap,
  DatasetCollectionDataProcessModeMap
} from '@fastgpt/global/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { TabEnum } from '../../../../pages/dataset/detail/index';
import dynamic from 'next/dynamic';
import SelectCollections from '@/web/core/dataset/components/SelectCollections';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { CollectionPageContext } from './Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { collectionCanSync } from '@fastgpt/global/core/dataset/collection/utils';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import TagsPopOver from './TagsPopOver';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import TrainingStates from './TrainingStates';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import {
  getCollectionTrainingStatusColorSchema,
  getCollectionTrainingStatusText
} from '@/web/core/dataset/trainingStatus';
import TrainingErrorModal from './TrainingErrorModal';
import type { DatasetCollectionsListItemType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { hasDatasetTrainingError as checkDatasetTrainingError } from '@/web/core/dataset/api/training';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const Header = dynamic(() => import('./Header'));
const EmptyCollectionTip = dynamic(() => import('./EmptyCollectionTip'));
const CollectionTagSetModal = dynamic(() => import('./CollectionTagSetModal'));
const CollectionTagBatchModal = dynamic(() => import('./CollectionTagBatchModal'));

const CollectionCard = () => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { datasetDetail, loadDatasetDetail } = useContextSelector(DatasetPageContext, (v) => v);
  const { feConfigs } = useSystemStore();

  const [trainingStatesCollection, setTrainingStatesCollection] = useState<{
    collectionId: string;
    permission: DatasetCollectionsListItemType['permission'];
  }>();
  const [isTrainingErrorModalOpen, setIsTrainingErrorModalOpen] = useState(false);
  const [hasDatasetTrainingError, setHasDatasetTrainingError] = useState(false);
  const [tagSetCollection, setTagSetCollection] = useState<DatasetCollectionsListItemType>();
  const [isBatchTagModalOpen, setIsBatchTagModalOpen] = useState(false);

  const {
    collections,
    Pagination,
    total,
    getData,
    isGetting,
    pageNum,
    pageSize,
    scrollContainerRef
  } = useContextSelector(CollectionPageContext, (v) => v);

  // Add file status icon
  const formatCollections = useMemo(
    () =>
      collections.map((collection) => {
        const icon = getCollectionIcon({ type: collection.type, name: collection.name });
        const statusColorSchema = getCollectionTrainingStatusColorSchema(collection);
        const statusText = getCollectionTrainingStatusText(collection);

        return {
          ...collection,
          icon,
          statusText,
          statusColorSchema
        };
      }),
    [collections]
  );

  const {
    selectedItems,
    toggleSelect,
    isSelected,
    setSelectedItems,
    isSelecteAll,
    selectAllTrigger,
    hasSelections
  } = useTableMultipleSelect({
    list: formatCollections,
    getItemId: (e) => e._id
  });

  const [moveCollectionData, setMoveCollectionData] = useState<{ collectionId: string }>();

  const { onOpenModal: onOpenEditTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:Rename')
  });

  const { runAsync: refreshDatasetTrainingError } = useRequest(
    async () => {
      const res = await checkDatasetTrainingError(datasetDetail._id);
      return res.hasError;
    },
    {
      manual: false,
      refreshDeps: [datasetDetail._id],
      errorToast: '',
      onSuccess(hasError) {
        setHasDatasetTrainingError(hasError);
      }
    }
  );

  const { runAsync: onUpdateCollection, loading: isUpdating } = useRequest(
    putDatasetCollectionById,
    {
      onSuccess() {
        getData(pageNum);
      },
      successToast: t('common:update_success')
    }
  );

  const { openConfirm: openDeleteConfirm, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('common:dataset.Confirm to delete the file'),
    type: 'delete'
  });
  const { runAsync: onDelCollection } = useRequest(
    (collectionIds: string[]) => {
      return delDatasetCollectionById({
        collectionIds
      });
    },
    {
      onSuccess() {
        getData(pageNum);
        refreshDatasetTrainingError().catch(() => undefined);
      },
      successToast: t('common:delete_success'),
      errorToast: t('common:delete_failed')
    }
  );

  const { openConfirm: openSyncConfirm, ConfirmModal: ConfirmSyncModal } = useConfirm({
    content: t('dataset:collection_sync_confirm_tip')
  });
  const { runAsync: onclickStartSync, loading: isSyncing } = useRequest(postLinkCollectionSync, {
    onSuccess(res: DatasetCollectionSyncResultEnum) {
      getData(pageNum);
      toast({
        status: 'success',
        title: t(DatasetCollectionSyncResultMap[res]?.label as any)
      });
    },
    errorToast: t('common:core.dataset.error.Start Sync Failed')
  });

  const hasTrainingData = useMemo(
    () => !!formatCollections.find((item) => item.trainingAmount > 0),
    [formatCollections]
  );
  const enabledCount = useMemo(
    () => formatCollections.filter((item) => !item.forbid).length,
    [formatCollections]
  );

  useRequest(
    async () => {
      const shouldRefreshTrainingError =
        hasTrainingData || datasetDetail.status !== DatasetStatusEnum.active;

      if (datasetDetail.status !== DatasetStatusEnum.active) {
        loadDatasetDetail(datasetDetail._id);
      }
      if (hasTrainingData) {
        getData(pageNum);
      }
      if (shouldRefreshTrainingError) {
        await refreshDatasetTrainingError().catch(() => undefined);
      }
    },
    {
      pollingInterval: 6000,
      manual: false
    }
  );

  const { getBoxProps, isDropping } = useFolderDrag({
    activeStyles: {
      bg: 'primary.100'
    },
    onDrop: async (dragId: string, targetId: string) => {
      try {
        await putDatasetCollectionById({
          id: dragId,
          parentId: targetId
        });
        getData(pageNum);
      } catch {
        // Drag failures are handled by the request layer toast; keep the list state unchanged here.
      }
    }
  });

  const isPageLoading = isUpdating || isSyncing || isDropping;

  return (
    <MyBox
      isLoading={isPageLoading}
      h={'100%'}
      py={[2, 4]}
      overflow={'hidden'}
      position={'relative'}
    >
      <Flex ref={BoxRef} flexDirection={'column'} py={[1, 0]} h={'100%'} px={[2, 6]}>
        {/* header */}
        <Header
          hasTrainingData={hasTrainingData}
          hasTrainingError={hasDatasetTrainingError}
          onOpenTrainingErrorModal={() => setIsTrainingErrorModalOpen(true)}
        />

        {/* collection table */}
        <MyBox isLoading={isGetting} mt={3} flex={'1 0 0'} h={0} overflow={'hidden'}>
          <TableContainer ref={scrollContainerRef} overflowY={'auto'} fontSize={'sm'} h={'100%'}>
            <Table
              variant={'simple'}
              draggable={false}
              sx={{
                thead: {
                  tr: {
                    borderBottom: 'none',
                    th: {
                      h: '40px',
                      py: 0,
                      px: 6,
                      fontSize: 'xs',
                      fontWeight: 'bold',
                      letterSpacing: '0.58px',
                      lineHeight: '16px',
                      color: 'myGray.600',
                      textTransform: 'none'
                    }
                  }
                },
                tbody: {
                  tr: {
                    h: '80px',
                    td: {
                      h: '80px',
                      py: 0,
                      px: 6,
                      borderBottom: 'sm',
                      borderLeftRadius: 0,
                      borderRightRadius: 0
                    }
                  }
                }
              }}
            >
              <Thead draggable={false}>
                <Tr>
                  <Th>
                    <HStack spacing={2.5}>
                      <Checkbox isChecked={isSelecteAll} onChange={selectAllTrigger} />
                      <Box>{t('common:Name')}</Box>
                    </HStack>
                  </Th>
                  <Th>{t('dataset:collection.training_type')}</Th>
                  <Th>{t('dataset:collection_data_count')}</Th>
                  <Th>{t('dataset:collection.Create update time')}</Th>
                  <Th>{t('common:Status')}</Th>
                  <Th>
                    {t('dataset:Enable')}({enabledCount})
                  </Th>
                  <Th>{t('common:Operation')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {formatCollections.map((collection) => (
                  <Tr
                    key={collection._id}
                    _hover={{ bg: 'myGray.50' }}
                    cursor={'pointer'}
                    {...getBoxProps({
                      dataId: collection._id,
                      isFolder: collection.type === DatasetCollectionTypeEnum.folder
                    })}
                    draggable={false}
                    onClick={() => {
                      if (collection.type === DatasetCollectionTypeEnum.folder) {
                        router.push({
                          query: {
                            datasetId: datasetDetail._id,
                            parentId: collection._id
                          }
                        });
                      } else {
                        router.push({
                          query: {
                            datasetId: datasetDetail._id,
                            collectionId: collection._id,
                            currentTab: TabEnum.dataCard
                          }
                        });
                      }
                    }}
                  >
                    <Td minW={'150px'} maxW={['200px', '300px']} draggable>
                      <HStack minW={0} alignItems={'center'} spacing={2}>
                        <HStack onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            isChecked={isSelected(collection)}
                            onChange={() => toggleSelect(collection)}
                          />
                        </HStack>
                        <Box minW={0} flex={1}>
                          <Flex alignItems={'center'} h={'20px'} minW={0}>
                            <MyIcon
                              name={collection.icon as any}
                              w={'20px'}
                              h={'20px'}
                              mr={2}
                              flexShrink={0}
                            />
                            <MyTooltip label={collection.name} showOnlyWhenOverflow>
                              <Box
                                color={'myGray.900'}
                                fontWeight={'medium'}
                                lineHeight={'20px'}
                                className="textEllipsis"
                                minW={0}
                                flex={'0 1 auto'}
                              >
                                {collection.name}
                              </Box>
                            </MyTooltip>
                          </Flex>
                          {feConfigs?.isPlus && !!collection.tags?.length && (
                            <Flex
                              h={'28px'}
                              pt={1.5}
                              pb={0.5}
                              w={'100%'}
                              minW={0}
                              overflow={'hidden'}
                            >
                              <TagsPopOver currentCollection={collection} />
                            </Flex>
                          )}
                        </Box>
                      </HStack>
                    </Td>
                    <Td>
                      {collection.trainingType
                        ? t(
                            (DatasetCollectionDataProcessModeMap[collection.trainingType]?.label ||
                              '-') as any
                          )
                        : '-'}
                    </Td>
                    <Td>{collection.dataAmount || '-'}</Td>
                    <Td fontSize={'xs'} color={'myGray.500'} lineHeight={'20px'}>
                      <Box>{formatTime2YMDHM(collection.createTime)}</Box>
                      <Box>{formatTime2YMDHM(collection.updateTime)}</Box>
                    </Td>
                    <Td>
                      <MyTooltip label={t('common:Click_to_expand')}>
                        <MyTag
                          showDot
                          colorSchema={collection.statusColorSchema}
                          type={'fill'}
                          fontSize={'mini'}
                          letterSpacing={'0.5px'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTrainingStatesCollection({
                              collectionId: collection._id,
                              permission: collection.permission
                            });
                          }}
                        >
                          <Flex fontWeight={'medium'} alignItems={'center'} gap={1}>
                            {t(collection.statusText as any)}
                            <MyIcon name={'common/maximize'} w={'10px'} h={'10px'} />
                          </Flex>
                        </MyTag>
                      </MyTooltip>
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <Switch
                        isChecked={!collection.forbid}
                        size={'sm'}
                        onChange={(e) =>
                          onUpdateCollection({
                            id: collection._id,
                            forbid: !e.target.checked
                          })
                        }
                      />
                    </Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      {collection.permission.hasWritePer && (
                        <MyMenu
                          width={100}
                          offset={[-70, 5]}
                          Button={
                            <MenuButton
                              w={'1.5rem'}
                              h={'1.5rem'}
                              borderRadius={'md'}
                              _hover={{
                                color: 'primary.500',
                                '& .icon': {
                                  bg: 'myGray.200'
                                }
                              }}
                            >
                              <MyIcon
                                className="icon"
                                name={'more'}
                                h={'1rem'}
                                w={'1rem'}
                                px={1}
                                py={1}
                                borderRadius={'md'}
                                cursor={'pointer'}
                              />
                            </MenuButton>
                          }
                          menuList={[
                            {
                              children: [
                                ...(collectionCanSync(collection.type)
                                  ? [
                                      {
                                        label: (
                                          <Flex alignItems={'center'}>
                                            <MyIcon
                                              name={'common/refreshLight'}
                                              w={'0.9rem'}
                                              mr={2}
                                            />
                                            {t('dataset:collection_sync')}
                                          </Flex>
                                        ),
                                        onClick: () =>
                                          openSyncConfirm({
                                            onConfirm: () => {
                                              onclickStartSync(collection._id);
                                            }
                                          })()
                                      }
                                    ]
                                  : []),
                                {
                                  label: (
                                    <Flex alignItems={'center'}>
                                      <MyIcon name={'common/file/move'} w={'0.9rem'} mr={2} />
                                      {t('common:Move')}
                                    </Flex>
                                  ),
                                  onClick: () =>
                                    setMoveCollectionData({ collectionId: collection._id })
                                },
                                {
                                  label: (
                                    <Flex alignItems={'center'}>
                                      <MyIcon name={'edit'} w={'0.9rem'} mr={2} />
                                      {t('common:Rename')}
                                    </Flex>
                                  ),
                                  onClick: () =>
                                    onOpenEditTitleModal({
                                      defaultVal: collection.name,
                                      onSuccess: (newName) =>
                                        onUpdateCollection({
                                          id: collection._id,
                                          name: newName
                                        })
                                    })
                                },
                                ...(feConfigs?.isPlus &&
                                datasetDetail.type !== DatasetTypeEnum.websiteDataset
                                  ? [
                                      {
                                        label: (
                                          <Flex alignItems={'center'}>
                                            <MyIcon name={'core/dataset/tag'} w={'0.9rem'} mr={2} />
                                            {t('dataset:tag.set')}
                                          </Flex>
                                        ),
                                        onClick: () => setTagSetCollection(collection)
                                      }
                                    ]
                                  : [])
                              ]
                            },
                            {
                              children: [
                                {
                                  label: (
                                    <Flex alignItems={'center'}>
                                      <MyIcon
                                        mr={1}
                                        name={'delete'}
                                        w={'0.9rem'}
                                        _hover={{ color: 'red.600' }}
                                      />
                                      <Box>{t('common:Delete')}</Box>
                                    </Flex>
                                  ),
                                  type: 'danger',
                                  onClick: () =>
                                    openDeleteConfirm({
                                      onConfirm: () => onDelCollection([collection._id]),
                                      customContent:
                                        collection.type === DatasetCollectionTypeEnum.folder
                                          ? t(
                                              'common:dataset.collections.Confirm to delete the folder'
                                            )
                                          : t('common:dataset.Confirm to delete the file')
                                    })()
                                }
                              ]
                            }
                          ]}
                        />
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {total === 0 && <EmptyCollectionTip />}
          </TableContainer>
        </MyBox>

        {total > pageSize && !hasSelections && (
          <Flex justifyContent={'center'} pt={4}>
            <Pagination />
          </Flex>
        )}

        {/* 勾选后浮在卡片底部中央，距底边 12px */}
        {hasSelections && (
          <Flex
            position={'absolute'}
            left={'50%'}
            bottom={'12px'}
            transform={'translateX(-50%)'}
            zIndex={2}
            h={'44px'}
            px={'22px'}
            alignItems={'center'}
            gap={4}
            bg={'white'}
            borderRadius={'md'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            boxShadow={'3'}
            maxW={'calc(100% - 24px)'}
          >
            <Flex alignItems={'center'} gap={2} h={'20px'} flexShrink={0}>
              <Checkbox
                size={'sm'}
                isChecked={isSelecteAll}
                isIndeterminate={hasSelections && !isSelecteAll}
                onChange={selectAllTrigger}
              />
              <Box
                as={'span'}
                cursor={'pointer'}
                fontSize={'xs'}
                lineHeight={'16px'}
                color={'myGray.600'}
                whiteSpace={'nowrap'}
                onClick={selectAllTrigger}
              >
                {t('dataset:collection.select_all_filtered')}
              </Box>
              <Box fontSize={'xs'} lineHeight={'16px'} color={'myGray.600'} whiteSpace={'nowrap'}>
                {t('dataset:tag.filter_selected')}
                <Box as={'span'} color={'primary.600'} px={'2px'}>
                  {selectedItems.length}
                </Box>
                {t('dataset:tag.filter_item')}
              </Box>
            </Flex>
            <HStack spacing={2} flexShrink={0}>
              {datasetDetail.permission.hasWritePer &&
                datasetDetail.type !== DatasetTypeEnum.websiteDataset &&
                feConfigs?.isPlus && (
                  <Button
                    variant={'whiteBase'}
                    h={7}
                    minH={7}
                    minW={'103px'}
                    px={'14px'}
                    fontSize={'xs'}
                    onClick={() => setIsBatchTagModalOpen(true)}
                  >
                    {t('dataset:tag.batch_edit')}
                  </Button>
                )}
              <Button
                variant={'whiteBase'}
                h={7}
                minH={7}
                minW={'103px'}
                px={'14px'}
                fontSize={'xs'}
                onClick={() =>
                  openDeleteConfirm({
                    onConfirm: () =>
                      onDelCollection(selectedItems.map((e) => e._id)).then(() =>
                        setSelectedItems([])
                      ),
                    customContent: t('dataset:confirm_delete_collection', {
                      num: selectedItems.length
                    })
                  })()
                }
              >
                {t('dataset:batch_delete')}
              </Button>
            </HStack>
          </Flex>
        )}

        <ConfirmDeleteModal />
        <ConfirmSyncModal />
        <EditTitleModal />

        {!!tagSetCollection && (
          <CollectionTagSetModal
            collection={tagSetCollection}
            onClose={() => setTagSetCollection(undefined)}
            onSuccess={() => {
              getData(pageNum);
              setTagSetCollection(undefined);
            }}
          />
        )}

        {isBatchTagModalOpen && (
          <CollectionTagBatchModal
            collections={selectedItems}
            onClose={() => setIsBatchTagModalOpen(false)}
            onSuccess={() => {
              getData(pageNum);
              setSelectedItems([]);
              setIsBatchTagModalOpen(false);
            }}
          />
        )}

        {!!trainingStatesCollection && (
          <TrainingStates
            collectionId={trainingStatesCollection.collectionId}
            permission={trainingStatesCollection.permission}
            onClose={() => setTrainingStatesCollection(undefined)}
          />
        )}

        {isTrainingErrorModalOpen && (
          <TrainingErrorModal
            datasetId={datasetDetail._id}
            permission={datasetDetail.permission}
            onClose={() => setIsTrainingErrorModalOpen(false)}
            onRefresh={() => {
              getData(pageNum);
              refreshDatasetTrainingError().catch(() => undefined);
            }}
          />
        )}

        {!!moveCollectionData && (
          <SelectCollections
            datasetId={datasetDetail._id}
            type="folder"
            defaultSelectedId={[moveCollectionData.collectionId]}
            onClose={() => setMoveCollectionData(undefined)}
            onSuccess={async ({ parentId }) => {
              await putDatasetCollectionById({
                id: moveCollectionData.collectionId,
                parentId
              });
              getData(pageNum);
              setMoveCollectionData(undefined);
              toast({
                status: 'success',
                title: t('common:move_success')
              });
            }}
          />
        )}
      </Flex>
    </MyBox>
  );
};

export default React.memo(CollectionCard);
