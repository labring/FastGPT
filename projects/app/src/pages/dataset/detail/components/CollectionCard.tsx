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
  useDisclosure
} from '@chakra-ui/react';
import {
  getDatasetCollections,
  delDatasetCollectionById,
  putDatasetCollectionById,
  postDatasetCollection,
  getDatasetCollectionPathById
} from '@/web/core/dataset/api';
import { useQuery } from '@tanstack/react-query';
import { debounce } from 'lodash';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useTranslation } from 'next-i18next';
import MyIcon from '@/components/Icon';
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
import { FolderAvatarSrc, DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import EditFolderModal, { useEditFolder } from '../../component/EditFolderModal';
import { TabEnum } from '..';
import ParentPath from '@/components/common/ParentPaths';
import dynamic from 'next/dynamic';
import { useDrag } from '@/web/common/hooks/useDrag';
import SelectCollections from '@/web/core/dataset/components/SelectCollections';
import { useToast } from '@/web/common/hooks/useToast';
import MyTooltip from '@/components/MyTooltip';
import { useUserStore } from '@/web/support/user/useUserStore';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

const FileImportModal = dynamic(() => import('./Import/ImportModal'), {});

const CollectionCard = () => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const lastSearch = useRef('');
  const router = useRouter();
  const { toast } = useToast();
  const { parentId = '', datasetId } = router.query as { parentId: string; datasetId: string };
  const { t } = useTranslation();
  const { Loading } = useLoading();
  const { isPc } = useSystemStore();
  const { userInfo } = useUserStore();
  const [searchText, setSearchText] = useState('');
  const { setLoading } = useSystemStore();

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('dataset.Confirm to delete the file')
  });
  const {
    isOpen: isOpenFileImportModal,
    onOpen: onOpenFileImportModal,
    onClose: onCloseFileImportModal
  } = useDisclosure();
  const { onOpenModal: onOpenCreateVirtualFileModal, EditModal: EditCreateVirtualFileModal } =
    useEditTitle({
      title: t('dataset.Create Virtual File'),
      tip: t('dataset.Virtual File Tip')
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
    isLoading,
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

        return {
          ...collection,
          icon,
          ...(collection.trainingAmount > 0
            ? {
                statusText: t('dataset.collections.Collection Embedding', {
                  total: collection.trainingAmount
                }),
                color: 'myGray.500'
              }
            : {
                statusText: t('dataset.collections.Ready'),
                color: 'green.500'
              })
        };
      }),
    [collections, t]
  );
  const hasTrainingData = useMemo(
    () => !!formatCollections.find((item) => item.trainingAmount > 0),
    [formatCollections]
  );

  const { mutate: onCreateVirtualFile } = useRequest({
    mutationFn: ({ name }: { name: string }) => {
      setLoading(true);
      return postDatasetCollection({
        parentId,
        datasetId,
        name,
        type: DatasetCollectionTypeEnum.virtual
      });
    },
    onSuccess() {
      getData(pageNum);
    },
    onSettled() {
      setLoading(false);
    },
    successToast: t('dataset.collections.Create Virtual File Success'),
    errorToast: t('common.Create Virtual File Failed')
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
  const { mutate: onDelCollection } = useRequest({
    mutationFn: (collectionId: string) => {
      setLoading(true);
      return delDatasetCollectionById({
        collectionId
      });
    },
    onSuccess() {
      getData(pageNum);
    },
    onSettled() {
      setLoading(false);
    },
    successToast: t('common.Delete Success'),
    errorToast: t('common.Delete Failed')
  });

  const { data: paths = [] } = useQuery(['getDatasetCollectionPathById', parentId], () =>
    getDatasetCollectionPathById(parentId)
  );

  useQuery(
    ['refreshCollection'],
    () => {
      getData(1);
      return null;
    },
    {
      refetchInterval: 6000,
      enabled: hasTrainingData
    }
  );

  useEffect(() => {
    getData(1);
  }, [parentId]);

  return (
    <Flex flexDirection={'column'} ref={BoxRef} py={[1, 3]} h={'100%'}>
      <Flex px={[2, 5]} alignItems={['flex-start', 'center']}>
        <Box flex={1}>
          <ParentPath
            paths={paths.map((path, i) => ({
              parentId: path.parentId,
              parentName: i === paths.length - 1 ? `${path.parentName}(${total})` : path.parentName
            }))}
            FirstPathDom={
              <Box fontWeight={'bold'} fontSize={['sm', 'lg']}>
                {t('common.File')}({total})
              </Box>
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
          <Flex alignItems={'center'} mr={2}>
            <MyInput
              leftIcon={
                <MyIcon
                  name="common/searchLight"
                  position={'absolute'}
                  w={'14px'}
                  color={'myGray.500'}
                />
              }
              w={['100%', '250px']}
              size={['sm', 'md']}
              placeholder={t('common.Search') || ''}
              value={searchText}
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
        {userInfo?.team?.role !== TeamMemberRoleEnum.visitor && (
          <MyMenu
            offset={[-40, 10]}
            width={120}
            Button={
              <MenuButton
                _hover={{
                  color: 'myBlue.600'
                }}
                fontSize={['sm', 'md']}
              >
                <Flex
                  alignItems={'center'}
                  px={5}
                  py={2}
                  borderRadius={'md'}
                  cursor={'pointer'}
                  bg={'myBlue.600'}
                  overflow={'hidden'}
                  color={'white'}
                  h={['28px', '35px']}
                >
                  <MyIcon name={'importLight'} mr={2} w={'14px'} />
                  <Box>{t('dataset.collections.Create And Import')}</Box>
                </Flex>
              </MenuButton>
            }
            menuList={[
              {
                child: (
                  <Flex>
                    <Image src={FolderAvatarSrc} alt={''} w={'20px'} mr={2} />
                    {t('Folder')}
                  </Flex>
                ),
                onClick: () => setEditFolderData({})
              },
              {
                child: (
                  <Flex>
                    <Image src={'/imgs/files/collection.svg'} alt={''} w={'20px'} mr={2} />
                    {t('dataset.Create Virtual File')}
                  </Flex>
                ),
                onClick: () => {
                  onOpenCreateVirtualFileModal({
                    defaultVal: '',
                    onSuccess: (name) => onCreateVirtualFile({ name })
                  });
                }
              },
              {
                child: (
                  <Flex>
                    <Image src={'/imgs/files/file.svg'} alt={''} w={'20px'} mr={2} />
                    {t('dataset.File Input')}
                  </Flex>
                ),
                onClick: onOpenFileImportModal
              }
            ]}
          />
        )}
      </Flex>

      <TableContainer mt={[0, 3]} position={'relative'} flex={'1 0 0'} overflowY={'auto'}>
        <Table variant={'simple'} fontSize={'sm'} draggable={false}>
          <Thead draggable={false}>
            <Tr>
              <Th>#</Th>
              <Th>{t('common.Name')}</Th>
              <Th>{t('dataset.collections.Data Amount')}</Th>
              <Th>{t('common.Time')}</Th>
              <Th>{t('common.Status')}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {formatCollections.map((collection, index) => (
              <Tr
                key={collection._id}
                _hover={{ bg: 'myWhite.600' }}
                cursor={'pointer'}
                data-drag-id={
                  collection.type === DatasetCollectionTypeEnum.folder ? collection._id : undefined
                }
                bg={dragTargetId === collection._id ? 'myBlue.200' : ''}
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
                title={
                  collection.type === DatasetCollectionTypeEnum.folder
                    ? t('dataset.collections.Click to view folder')
                    : t('dataset.collections.Click to view file')
                }
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
                    <Image src={collection.icon} w={'16px'} mr={2} alt={''} />
                    <MyTooltip label={t('common.folder.Drag Tip')} shouldWrapChildren={false}>
                      <Box fontWeight={'bold'} className="textEllipsis">
                        {collection.name}
                      </Box>
                    </MyTooltip>
                  </Flex>
                </Td>
                <Td fontSize={'md'}>
                  {collection.type === DatasetCollectionTypeEnum.folder
                    ? '-'
                    : collection.dataAmount}
                </Td>
                <Td>{dayjs(collection.updateTime).format('YYYY/MM/DD HH:mm')}</Td>
                <Td>
                  <Flex
                    alignItems={'center'}
                    _before={{
                      content: '""',
                      w: '10px',
                      h: '10px',
                      mr: 2,
                      borderRadius: 'lg',
                      bg: collection?.color
                    }}
                  >
                    {collection?.statusText}
                  </Flex>
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  {collection.canWrite && userInfo?.team?.role !== TeamMemberRoleEnum.visitor && (
                    <MyMenu
                      width={100}
                      Button={
                        <MenuButton
                          w={'22px'}
                          h={'22px'}
                          borderRadius={'md'}
                          _hover={{
                            color: 'myBlue.600',
                            '& .icon': {
                              bg: 'myGray.100'
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
                          child: (
                            <Flex alignItems={'center'}>
                              <MyIcon name={'common/file/move'} w={'14px'} mr={2} />
                              {t('Move')}
                            </Flex>
                          ),
                          onClick: () => setMoveCollectionData({ collectionId: collection._id })
                        },
                        {
                          child: (
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
                          child: (
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
                            openConfirm(
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
        <Loading loading={isLoading && collections.length === 0} fixed={false} />
        {total > pageSize && (
          <Flex mt={2} justifyContent={'center'}>
            <Pagination />
          </Flex>
        )}
        {total === 0 && <EmptyTip text="数据集空空如也" />}
      </TableContainer>

      <ConfirmModal />
      <EditTitleModal />
      <EditCreateVirtualFileModal />
      {isOpenFileImportModal && (
        <FileImportModal
          datasetId={datasetId}
          parentId={parentId}
          uploadSuccess={() => {
            getData(1);
            onCloseFileImportModal();
          }}
          onClose={onCloseFileImportModal}
        />
      )}

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
              } else {
                await postDatasetCollection({
                  parentId,
                  datasetId,
                  name,
                  type: DatasetCollectionTypeEnum.folder
                });
              }
              getData(pageNum);
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
    </Flex>
  );
};

export default React.memo(CollectionCard);
