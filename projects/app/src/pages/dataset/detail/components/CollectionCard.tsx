import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
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
  Image,
  MenuButton,
  useDisclosure,
  Button,
  Link,
  useTheme
} from '@chakra-ui/react';
import {
  getDatasetCollections,
  delDatasetCollectionById,
  putDatasetCollectionById,
  postDatasetCollection,
  getDatasetCollectionPathById,
  postLinkCollectionSync
} from '@/web/core/dataset/api';
import { useQuery } from '@tanstack/react-query';
import { debounce } from 'lodash';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import dayjs from 'dayjs';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useLoading } from '@/web/common/hooks/useLoading';
import { useRouter } from 'next/router';
import { usePagination } from '@/web/common/hooks/usePagination';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyMenu from '@/components/MyMenu';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type.d';
import EmptyTip from '@/components/EmptyTip';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum,
  DatasetTypeEnum,
  DatasetTypeMap,
  DatasetStatusEnum,
  DatasetCollectionSyncResultMap
} from '@fastgpt/global/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import EditFolderModal, { useEditFolder } from '../../component/EditFolderModal';
import { TabEnum } from '..';
import ParentPath from '@/components/common/ParentPaths';
import dynamic from 'next/dynamic';
import { useDrag } from '@/web/common/hooks/useDrag';
import SelectCollections from '@/web/core/dataset/components/SelectCollections';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@/components/MyTooltip';
import { useUserStore } from '@/web/support/user/useUserStore';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import MyBox from '@/components/common/MyBox';
import { ImportDataSourceEnum } from './Import';

const WebSiteConfigModal = dynamic(() => import('./Import/WebsiteConfig'), {});
const FileSourceSelector = dynamic(() => import('./Import/sourceSelector/FileSourceSelector'), {});

const CollectionCard = () => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const lastSearch = useRef('');
  const router = useRouter();
  const theme = useTheme();
  const { toast } = useToast();
  const { parentId = '', datasetId } = router.query as { parentId: string; datasetId: string };
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const { isPc } = useSystemStore();
  const { userInfo } = useUserStore();
  const [searchText, setSearchText] = useState('');
  const { datasetDetail, updateDataset, startWebsiteSync, loadDatasetDetail } = useDatasetStore();

  const { openConfirm: openDeleteConfirm, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('dataset.Confirm to delete the file')
  });
  const { openConfirm: openSyncConfirm, ConfirmModal: ConfirmSyncModal } = useConfirm({
    content: t('core.dataset.collection.Start Sync Tip')
  });

  const {
    isOpen: isOpenFileSourceSelector,
    onOpen: onOpenFileSourceSelector,
    onClose: onCloseFileSourceSelector
  } = useDisclosure();
  const {
    isOpen: isOpenWebsiteModal,
    onOpen: onOpenWebsiteModal,
    onClose: onCloseWebsiteModal
  } = useDisclosure();
  const { onOpenModal: onOpenCreateVirtualFileModal, EditModal: EditCreateVirtualFileModal } =
    useEditTitle({
      title: t('dataset.Create manual collection'),
      tip: t('dataset.Manual collection Tip'),
      canEmpty: false
    });

  const { onOpenModal: onOpenEditTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('Rename')
  });

  const { editFolderData, setEditFolderData } = useEditFolder();
  const [moveCollectionData, setMoveCollectionData] = useState<{ collectionId: string }>();

  const {
    data: collections,
    Pagination,
    total,
    getData,
    isLoading: isGetting,
    pageNum,
    pageSize
  } = usePagination<DatasetCollectionsListItemType>({
    api: getDatasetCollections,
    pageSize: 20,
    params: {
      datasetId,
      parentId,
      searchText
    },
    defaultRequest: false,
    onChange() {
      if (BoxRef.current) {
        BoxRef.current.scrollTop = 0;
      }
    }
  });

  const { dragStartId, setDragStartId, dragTargetId, setDragTargetId } = useDrag();

  // change search
  const debounceRefetch = useCallback(
    debounce(() => {
      getData(1);
      lastSearch.current = searchText;
    }, 300),
    []
  );

  // add file icon
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

  const { mutate: onCreateCollection, isLoading: isCreating } = useRequest({
    mutationFn: async ({
      name,
      type,
      callback,
      ...props
    }: {
      name: string;
      type: `${DatasetCollectionTypeEnum}`;
      callback?: (id: string) => void;
      trainingType?: `${TrainingModeEnum}`;
      rawLink?: string;
      chunkSize?: number;
    }) => {
      const id = await postDatasetCollection({
        parentId,
        datasetId,
        name,
        type,
        ...props
      });
      callback?.(id);
      return id;
    },
    onSuccess() {
      getData(pageNum);
    },

    successToast: t('common.Create Success'),
    errorToast: t('common.Create Failed')
  });
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
  const { mutate: onUpdateDatasetWebsiteConfig, isLoading: isUpdating } = useRequest({
    mutationFn: async (websiteConfig: DatasetSchemaType['websiteConfig']) => {
      onCloseWebsiteModal();
      await updateDataset({
        id: datasetDetail._id,
        websiteConfig
      });
      return startWebsiteSync();
    },
    errorToast: t('common.Update Failed')
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

  const { data: paths = [] } = useQuery(['getDatasetCollectionPathById', parentId], () =>
    getDatasetCollectionPathById(parentId)
  );

  const hasTrainingData = useMemo(
    () => !!formatCollections.find((item) => item.trainingAmount > 0),
    [formatCollections]
  );
  const isLoading = useMemo(
    () =>
      isCreating ||
      isDeleting ||
      isUpdating ||
      isSyncing ||
      (isGetting && collections.length === 0),
    [collections.length, isCreating, isDeleting, isGetting, isSyncing, isUpdating]
  );

  useQuery(
    ['refreshCollection'],
    () => {
      getData(1);
      if (datasetDetail.status === DatasetStatusEnum.syncing) {
        loadDatasetDetail(datasetId, true);
      }
      return null;
    },
    {
      refetchInterval: 6000,
      enabled: hasTrainingData || datasetDetail.status === DatasetStatusEnum.syncing
    }
  );

  useEffect(() => {
    getData(1);
  }, [parentId]);

  return (
    <MyBox isLoading={isLoading} h={'100%'} py={[2, 4]}>
      <Flex ref={BoxRef} flexDirection={'column'} py={[1, 3]} h={'100%'}>
        {/* header */}
        <Flex px={[2, 6]} alignItems={'flex-start'} h={'35px'}>
          <Box flex={1}>
            <ParentPath
              paths={paths.map((path, i) => ({
                parentId: path.parentId,
                parentName: i === paths.length - 1 ? `${path.parentName}` : path.parentName
              }))}
              FirstPathDom={
                <>
                  <Box fontWeight={'bold'} fontSize={['sm', 'lg']}>
                    {t(DatasetTypeMap[datasetDetail?.type]?.collectionLabel)}({total})
                  </Box>
                  {datasetDetail?.websiteConfig?.url && (
                    <Flex fontSize={'sm'}>
                      {t('core.dataset.website.Base Url')}:
                      <Link
                        href={datasetDetail.websiteConfig.url}
                        target="_blank"
                        mr={2}
                        textDecoration={'underline'}
                        color={'primary.600'}
                      >
                        {datasetDetail.websiteConfig.url}
                      </Link>
                    </Flex>
                  )}
                </>
              }
              onClick={(e) => {
                router.replace({
                  query: {
                    ...router.query,
                    parentId: e
                  }
                });
              }}
            />
          </Box>

          {isPc && (
            <Flex alignItems={'center'} mr={4}>
              <MyInput
                bg={'myGray.50'}
                w={['100%', '250px']}
                size={'sm'}
                h={'36px'}
                placeholder={t('common.Search') || ''}
                value={searchText}
                leftIcon={
                  <MyIcon
                    name="common/searchLight"
                    position={'absolute'}
                    w={'16px'}
                    color={'myGray.500'}
                  />
                }
                onChange={(e) => {
                  setSearchText(e.target.value);
                  debounceRefetch();
                }}
                onBlur={() => {
                  if (searchText === lastSearch.current) return;
                  getData(1);
                }}
                onKeyDown={(e) => {
                  if (searchText === lastSearch.current) return;
                  if (e.key === 'Enter') {
                    getData(1);
                  }
                }}
              />
            </Flex>
          )}
          {datasetDetail?.type === DatasetTypeEnum.dataset && (
            <>
              {userInfo?.team?.role !== TeamMemberRoleEnum.visitor && (
                <MyMenu
                  offset={[0, 5]}
                  Button={
                    <MenuButton
                      _hover={{
                        color: 'primary.500'
                      }}
                      fontSize={['sm', 'md']}
                    >
                      <Flex
                        alignItems={'center'}
                        px={5}
                        py={2}
                        borderRadius={'md'}
                        cursor={'pointer'}
                        bg={'primary.500'}
                        overflow={'hidden'}
                        color={'white'}
                        h={['28px', '35px']}
                      >
                        <MyIcon name={'common/importLight'} mr={2} w={'14px'} />
                        <Box>{t('dataset.collections.Create And Import')}</Box>
                      </Flex>
                    </MenuButton>
                  }
                  menuList={[
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'common/folderFill'} w={'20px'} mr={2} />
                          {t('Folder')}
                        </Flex>
                      ),
                      onClick: () => setEditFolderData({})
                    },
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/manualCollection'} mr={2} w={'20px'} />
                          {t('core.dataset.Manual collection')}
                        </Flex>
                      ),
                      onClick: () => {
                        onOpenCreateVirtualFileModal({
                          defaultVal: '',
                          onSuccess: (name) => {
                            onCreateCollection({ name, type: DatasetCollectionTypeEnum.virtual });
                          }
                        });
                      }
                    },
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/fileCollection'} mr={2} w={'20px'} />
                          {t('core.dataset.Text collection')}
                        </Flex>
                      ),
                      onClick: onOpenFileSourceSelector
                    },
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/tableCollection'} mr={2} w={'20px'} />
                          {t('core.dataset.Table collection')}
                        </Flex>
                      ),
                      onClick: () =>
                        router.replace({
                          query: {
                            ...router.query,
                            currentTab: TabEnum.import,
                            source: ImportDataSourceEnum.tableLocal
                          }
                        })
                    }
                  ]}
                />
              )}
            </>
          )}
          {datasetDetail?.type === DatasetTypeEnum.websiteDataset && (
            <>
              {datasetDetail?.websiteConfig?.url ? (
                <Flex alignItems={'center'}>
                  {datasetDetail.status === DatasetStatusEnum.active && (
                    <Button onClick={onOpenWebsiteModal}>{t('common.Config')}</Button>
                  )}
                  {datasetDetail.status === DatasetStatusEnum.syncing && (
                    <Flex
                      ml={3}
                      alignItems={'center'}
                      px={3}
                      py={1}
                      borderRadius="md"
                      border={theme.borders.base}
                    >
                      <Box
                        animation={'zoomStopIcon 0.5s infinite alternate'}
                        bg={'myGray.700'}
                        w="8px"
                        h="8px"
                        borderRadius={'50%'}
                        mt={'1px'}
                      ></Box>
                      <Box ml={2} color={'myGray.600'}>
                        {t('core.dataset.status.syncing')}
                      </Box>
                    </Flex>
                  )}
                </Flex>
              ) : (
                <Button onClick={onOpenWebsiteModal}>{t('core.dataset.Set Website Config')}</Button>
              )}
            </>
          )}
        </Flex>

        {/* collection table */}
        <TableContainer
          px={[2, 6]}
          mt={[0, 3]}
          position={'relative'}
          flex={'1 0 0'}
          overflowY={'auto'}
        >
          <Table variant={'simple'} fontSize={'sm'} draggable={false}>
            <Thead draggable={false}>
              <Tr bg={'myGray.100'} mb={2}>
                <Th borderLeftRadius={'md'} overflow={'hidden'} borderBottom={'none'} py={4}>
                  #
                </Th>
                <Th borderBottom={'none'} py={4}>
                  {t('common.Name')}
                </Th>
                <Th borderBottom={'none'} py={4}>
                  {t('dataset.collections.Data Amount')}
                </Th>
                <Th borderBottom={'none'} py={4}>
                  {t('core.dataset.Sync Time')}
                </Th>
                <Th borderBottom={'none'} py={4}>
                  {t('common.Status')}
                </Th>
                <Th borderRightRadius={'md'} overflow={'hidden'} borderBottom={'none'} py={4} />
              </Tr>
            </Thead>
            <Tbody>
              {formatCollections.map((collection, index) => (
                <Tr
                  key={collection._id}
                  _hover={{ bg: 'myWhite.600' }}
                  cursor={'pointer'}
                  data-drag-id={
                    collection.type === DatasetCollectionTypeEnum.folder
                      ? collection._id
                      : undefined
                  }
                  bg={dragTargetId === collection._id ? 'primary.100' : ''}
                  userSelect={'none'}
                  onDragStart={(e) => {
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
                        <Box fontWeight={'bold'} className="textEllipsis">
                          {collection.name}
                        </Box>
                      </MyTooltip>
                    </Flex>
                  </Td>
                  <Td fontSize={'md'}>{collection.dataAmount || '-'}</Td>
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
                    {collection.canWrite && userInfo?.team?.role !== TeamMemberRoleEnum.visitor && (
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
                            onClick: () => setMoveCollectionData({ collectionId: collection._id })
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
                          },
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
          {total === 0 && (
            <EmptyTip
              text={
                datasetDetail.type === DatasetTypeEnum.dataset ? (
                  t('core.dataset.collection.Empty Tip')
                ) : (
                  <Flex>
                    {datasetDetail.status === DatasetStatusEnum.syncing && (
                      <>{t('core.dataset.status.syncing')}</>
                    )}
                    {datasetDetail.status === DatasetStatusEnum.active && (
                      <>
                        {!datasetDetail?.websiteConfig?.url ? (
                          <>
                            {t('core.dataset.collection.Website Empty Tip')}
                            {', '}
                            <Box
                              textDecoration={'underline'}
                              cursor={'pointer'}
                              onClick={onOpenWebsiteModal}
                            >
                              {t('core.dataset.collection.Click top config website')}
                            </Box>
                          </>
                        ) : (
                          <>{t('core.dataset.website.UnValid Website Tip')}</>
                        )}
                      </>
                    )}
                  </Flex>
                )
              }
            />
          )}
        </TableContainer>

        <ConfirmDeleteModal />
        <ConfirmSyncModal />
        <EditTitleModal />
        <EditCreateVirtualFileModal iconSrc={'modal/manualDataset'} closeBtnText={''} />
        {/* {isOpenFileImportModal && (
          <FileImportModal
            datasetId={datasetId}
            parentId={parentId}
            uploadSuccess={() => {
              getData(1);
              onCloseFileImportModal();
            }}
            onClose={onCloseFileImportModal}
          />
        )} */}
        {isOpenFileSourceSelector && <FileSourceSelector onClose={onCloseFileSourceSelector} />}
        {!!editFolderData && (
          <EditFolderModal
            onClose={() => setEditFolderData(undefined)}
            editCallback={async (name) => {
              try {
                if (editFolderData.id) {
                  await putDatasetCollectionById({
                    id: editFolderData.id,
                    name
                  });
                  getData(pageNum);
                } else {
                  onCreateCollection({
                    name,
                    type: DatasetCollectionTypeEnum.folder
                  });
                }
              } catch (error) {
                return Promise.reject(error);
              }
            }}
            isEdit={!!editFolderData.id}
            name={editFolderData.name}
          />
        )}
        {!!moveCollectionData && (
          <SelectCollections
            datasetId={datasetId}
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
        {isOpenWebsiteModal && (
          <WebSiteConfigModal
            onClose={onCloseWebsiteModal}
            onSuccess={onUpdateDatasetWebsiteConfig}
            defaultValue={{
              url: datasetDetail?.websiteConfig?.url,
              selector: datasetDetail?.websiteConfig?.selector
            }}
          />
        )}
      </Flex>
    </MyBox>
  );
};

export default React.memo(CollectionCard);
