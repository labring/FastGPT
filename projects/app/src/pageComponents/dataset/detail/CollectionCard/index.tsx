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

const Header = dynamic(() => import('./Header'));
const EmptyCollectionTip = dynamic(() => import('./EmptyCollectionTip'));

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

  const { collections, Pagination, total, getData, isGetting, pageNum, pageSize } =
    useContextSelector(CollectionPageContext, (v) => v);

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
    FloatingActionBar,
    isSelecteAll,
    selectAllTrigger
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

  const isLoading = isUpdating || isSyncing || isGetting || isDropping;

  return (
    <MyBox isLoading={isLoading} h={'100%'} py={[2, 4]} overflow={'hidden'}>
      <Flex ref={BoxRef} flexDirection={'column'} py={[1, 0]} h={'100%'} px={[2, 6]}>
        {/* header */}
        <Header
          hasTrainingData={hasTrainingData}
          hasTrainingError={hasDatasetTrainingError}
          onOpenTrainingErrorModal={() => setIsTrainingErrorModalOpen(true)}
        />

        {/* collection table */}
        <TableContainer mt={3} overflowY={'auto'} fontSize={'sm'} flex={'1 0 0'} h={0}>
          <Table variant={'simple'} draggable={false}>
            <Thead draggable={false}>
              <Tr>
                <Th py={4}>
                  <HStack>
                    <Checkbox isChecked={isSelecteAll} onChange={selectAllTrigger} />
                    <Box>{t('common:Name')}</Box>
                  </HStack>
                </Th>
                <Th py={4}>{t('dataset:collection.training_type')}</Th>
                <Th py={4}>{t('dataset:collection_data_count')}</Th>
                <Th py={4}>{t('dataset:collection.Create update time')}</Th>
                <Th py={4}>{t('common:Status')}</Th>
                <Th py={4}>{t('dataset:Enable')}</Th>
                <Th py={4} />
              </Tr>
            </Thead>
            <Tbody>
              <Tr h={'5px'} />
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
                  <Td minW={'150px'} maxW={['200px', '300px']} draggable py={2}>
                    <HStack minW={0}>
                      <HStack onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          isChecked={isSelected(collection)}
                          onChange={() => toggleSelect(collection)}
                        />
                      </HStack>
                      <Box minW={0} flex={1}>
                        <Flex alignItems={'center'} minW={0}>
                          <MyIcon
                            name={collection.icon as any}
                            w={'1.25rem'}
                            mr={2}
                            flexShrink={0}
                          />
                          <MyTooltip label={collection.name} showOnlyWhenOverflow>
                            <Box
                              color={'myGray.900'}
                              fontWeight={'500'}
                              className="textEllipsis"
                              minW={0}
                              flex={'0 1 auto'}
                            >
                              {collection.name}
                            </Box>
                          </MyTooltip>
                        </Flex>
                        {feConfigs?.isPlus && !!collection.tags?.length && (
                          <TagsPopOver currentCollection={collection} hoverBg={'white'} />
                        )}
                      </Box>
                    </HStack>
                  </Td>
                  <Td py={2}>
                    {collection.trainingType
                      ? t(
                        (DatasetCollectionDataProcessModeMap[collection.trainingType]?.label ||
                          '-') as any
                      )
                      : '-'}
                  </Td>
                  <Td py={2}>{collection.dataAmount || '-'}</Td>
                  <Td fontSize={'xs'} py={2} color={'myGray.500'}>
                    <Box>{formatTime2YMDHM(collection.createTime)}</Box>
                    <Box>{formatTime2YMDHM(collection.updateTime)}</Box>
                  </Td>
                  <Td py={2}>
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
                  <Td py={2} onClick={(e) => e.stopPropagation()}>
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
                  <Td py={2} onClick={(e) => e.stopPropagation()}>
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
                              }
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

        <FloatingActionBar
          pt={4}
          Controler={
            <HStack>
              <Button
                variant={'whiteBase'}
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
          }
        >
          {total > pageSize && (
            <Flex justifyContent={'center'}>
              <Pagination />
            </Flex>
          )}
        </FloatingActionBar>

        <ConfirmDeleteModal />
        <ConfirmSyncModal />
        <EditTitleModal />

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