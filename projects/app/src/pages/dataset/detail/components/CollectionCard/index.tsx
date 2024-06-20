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
  MenuButton
} from '@chakra-ui/react';
import {
  delDatasetCollectionById,
  putDatasetCollectionById,
  postLinkCollectionSync
} from '@/web/core/dataset/api';
import { useQuery } from '@tanstack/react-query';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dayjs from 'dayjs';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import {
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  DatasetCollectionSyncResultMap
} from '@fastgpt/global/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { TabEnum } from '../../index';
import dynamic from 'next/dynamic';
import { useDrag } from '@/web/common/hooks/useDrag';
import SelectCollections from '@/web/core/dataset/components/SelectCollections';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { CollectionPageContext } from './Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';

const Header = dynamic(() => import('./Header'));
const EmptyCollectionTip = dynamic(() => import('./EmptyCollectionTip'));

const CollectionCard = () => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { datasetDetail, loadDatasetDetail } = useContextSelector(DatasetPageContext, (v) => v);

  const { openConfirm: openDeleteConfirm, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('dataset.Confirm to delete the file'),
    type: 'delete'
  });
  const { openConfirm: openSyncConfirm, ConfirmModal: ConfirmSyncModal } = useConfirm({
    content: t('core.dataset.collection.Start Sync Tip')
  });

  const { onOpenModal: onOpenEditTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('Rename')
  });

  const [moveCollectionData, setMoveCollectionData] = useState<{ collectionId: string }>();

  const { collections, Pagination, total, getData, isGetting, pageNum, pageSize } =
    useContextSelector(CollectionPageContext, (v) => v);

  const { dragStartId, setDragStartId, dragTargetId, setDragTargetId } = useDrag();

  // Ad file status icon
  const formatCollections = useMemo(
    () =>
      collections.map((collection) => {
        const icon = getCollectionIcon(collection.type, collection.name);
        const status = (() => {
          if (collection.trainingAmount > 0) {
            return {
              statusText: t('dataset.collections.Collection Embedding', {
                total: collection.trainingAmount
              }),
              color: 'myGray.600',
              bg: 'myGray.50',
              borderColor: 'borderColor.low'
            };
          }
          return {
            statusText: t('core.dataset.collection.status.active'),
            color: 'green.600',
            bg: 'green.50',
            borderColor: 'green.300'
          };
        })();

        return {
          ...collection,
          icon,
          ...status
        };
      }),
    [collections, t]
  );

  const { mutate: onUpdateCollectionName } = useRequest({
    mutationFn: ({ collectionId, name }: { collectionId: string; name: string }) => {
      return putDatasetCollectionById({
        id: collectionId,
        name
      });
    },
    onSuccess() {
      getData(pageNum);
    },

    successToast: t('common.Rename Success'),
    errorToast: t('common.Rename Failed')
  });
  const { mutate: onDelCollection, isLoading: isDeleting } = useRequest({
    mutationFn: (collectionId: string) => {
      return delDatasetCollectionById({
        id: collectionId
      });
    },
    onSuccess() {
      getData(pageNum);
    },
    successToast: t('common.Delete Success'),
    errorToast: t('common.Delete Failed')
  });

  const { mutate: onclickStartSync, isLoading: isSyncing } = useRequest({
    mutationFn: (collectionId: string) => {
      return postLinkCollectionSync(collectionId);
    },
    onSuccess(res: DatasetCollectionSyncResultEnum) {
      getData(pageNum);
      toast({
        status: 'success',
        title: t(DatasetCollectionSyncResultMap[res]?.label)
      });
    },
    errorToast: t('core.dataset.error.Start Sync Failed')
  });

  const hasTrainingData = useMemo(
    () => !!formatCollections.find((item) => item.trainingAmount > 0),
    [formatCollections]
  );
  const isLoading = useMemo(
    () => isDeleting || isSyncing || (isGetting && collections.length === 0),
    [collections.length, isDeleting, isGetting, isSyncing]
  );

  useQuery(
    ['refreshCollection'],
    () => {
      getData(1);
      if (datasetDetail.status === DatasetStatusEnum.syncing) {
        loadDatasetDetail(datasetDetail._id);
      }
      return null;
    },
    {
      refetchInterval: 6000,
      enabled: hasTrainingData || datasetDetail.status === DatasetStatusEnum.syncing
    }
  );

  return (
    <MyBox isLoading={isLoading} h={'100%'} py={[2, 4]}>
      <Flex ref={BoxRef} flexDirection={'column'} py={[1, 3]} h={'100%'}>
        {/* header */}
        <Header />

        {/* collection table */}
        <TableContainer
          px={[2, 6]}
          mt={[0, 3]}
          position={'relative'}
          flex={'1 0 0'}
          overflowY={'auto'}
          fontSize={'sm'}
        >
          <Table variant={'simple'} draggable={false}>
            <Thead draggable={false}>
              <Tr>
                <Th py={4}>#</Th>
                <Th py={4}>{t('common.Name')}</Th>
                <Th py={4}>{t('dataset.collections.Data Amount')}</Th>
                <Th py={4}>{t('core.dataset.Sync Time')}</Th>
                <Th py={4}>{t('common.Status')}</Th>
                <Th py={4} />
              </Tr>
            </Thead>
            <Tbody>
              <Tr h={'10px'} />
              {formatCollections.map((collection, index) => (
                <Tr
                  key={collection._id}
                  _hover={{ bg: 'myGray.50' }}
                  cursor={'pointer'}
                  data-drag-id={
                    collection.type === DatasetCollectionTypeEnum.folder
                      ? collection._id
                      : undefined
                  }
                  bg={dragTargetId === collection._id ? 'primary.100' : ''}
                  userSelect={'none'}
                  onDragStart={() => {
                    setDragStartId(collection._id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const targetId = e.currentTarget.getAttribute('data-drag-id');
                    if (!targetId) return;
                    DatasetCollectionTypeEnum.folder && setDragTargetId(targetId);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragTargetId(undefined);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    if (!dragTargetId || !dragStartId || dragTargetId === dragStartId) return;
                    // update parentId
                    try {
                      await putDatasetCollectionById({
                        id: dragStartId,
                        parentId: dragTargetId
                      });
                      getData(pageNum);
                    } catch (error) {}
                    setDragTargetId(undefined);
                  }}
                  onClick={() => {
                    if (collection.type === DatasetCollectionTypeEnum.folder) {
                      router.replace({
                        query: {
                          ...router.query,
                          parentId: collection._id
                        }
                      });
                    } else {
                      router.replace({
                        query: {
                          ...router.query,
                          collectionId: collection._id,
                          currentTab: TabEnum.dataCard
                        }
                      });
                    }
                  }}
                >
                  <Td w={'50px'}>{index + 1}</Td>
                  <Td minW={'150px'} maxW={['200px', '300px']} draggable>
                    <Flex alignItems={'center'}>
                      <MyIcon name={collection.icon as any} w={'16px'} mr={2} />
                      <MyTooltip label={t('common.folder.Drag Tip')} shouldWrapChildren={false}>
                        <Box color={'myGray.900'} className="textEllipsis">
                          {collection.name}
                        </Box>
                      </MyTooltip>
                    </Flex>
                  </Td>
                  <Td>{collection.dataAmount || '-'}</Td>
                  <Td>{dayjs(collection.updateTime).format('YYYY/MM/DD HH:mm')}</Td>
                  <Td>
                    <Box
                      display={'inline-flex'}
                      alignItems={'center'}
                      w={'auto'}
                      color={collection.color}
                      bg={collection.bg}
                      borderWidth={'1px'}
                      borderColor={collection.borderColor}
                      px={3}
                      py={1}
                      borderRadius={'md'}
                      _before={{
                        content: '""',
                        w: '6px',
                        h: '6px',
                        mr: 2,
                        borderRadius: 'lg',
                        bg: collection.color
                      }}
                    >
                      {t(collection.statusText)}
                    </Box>
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {collection.permission.hasWritePer && (
                      <MyMenu
                        width={100}
                        offset={[-70, 5]}
                        Button={
                          <MenuButton
                            w={'22px'}
                            h={'22px'}
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
                              h={'16px'}
                              w={'16px'}
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
                              ...(collection.type === DatasetCollectionTypeEnum.link
                                ? [
                                    {
                                      label: (
                                        <Flex alignItems={'center'}>
                                          <MyIcon name={'common/refreshLight'} w={'14px'} mr={2} />
                                          {t('core.dataset.collection.Sync')}
                                        </Flex>
                                      ),
                                      onClick: () =>
                                        openSyncConfirm(() => {
                                          onclickStartSync(collection._id);
                                        })()
                                    }
                                  ]
                                : []),
                              {
                                label: (
                                  <Flex alignItems={'center'}>
                                    <MyIcon name={'common/file/move'} w={'14px'} mr={2} />
                                    {t('Move')}
                                  </Flex>
                                ),
                                onClick: () =>
                                  setMoveCollectionData({ collectionId: collection._id })
                              },
                              {
                                label: (
                                  <Flex alignItems={'center'}>
                                    <MyIcon name={'edit'} w={'14px'} mr={2} />
                                    {t('Rename')}
                                  </Flex>
                                ),
                                onClick: () =>
                                  onOpenEditTitleModal({
                                    defaultVal: collection.name,
                                    onSuccess: (newName) => {
                                      onUpdateCollectionName({
                                        collectionId: collection._id,
                                        name: newName
                                      });
                                    }
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
                                      w={'14px'}
                                      _hover={{ color: 'red.600' }}
                                    />
                                    <Box>{t('common.Delete')}</Box>
                                  </Flex>
                                ),
                                type: 'danger',
                                onClick: () =>
                                  openDeleteConfirm(
                                    () => {
                                      onDelCollection(collection._id);
                                    },
                                    undefined,
                                    collection.type === DatasetCollectionTypeEnum.folder
                                      ? t('dataset.collections.Confirm to delete the folder')
                                      : t('dataset.Confirm to delete the file')
                                  )()
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
          {total > pageSize && (
            <Flex mt={2} justifyContent={'center'}>
              <Pagination />
            </Flex>
          )}
          {total === 0 && <EmptyCollectionTip />}
        </TableContainer>

        <ConfirmDeleteModal />
        <ConfirmSyncModal />
        <EditTitleModal />

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
                title: t('common.folder.Move Success')
              });
            }}
          />
        )}
      </Flex>
    </MyBox>
  );
};

export default React.memo(CollectionCard);
