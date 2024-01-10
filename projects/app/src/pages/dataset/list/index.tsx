import React, { useMemo, useRef } from 'react';
import {
  Box,
  Flex,
  Grid,
  useTheme,
  useDisclosure,
  Card,
  MenuButton,
  Image,
  Button
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import PageContainer from '@/components/PageContainer';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { AddIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import {
  delDatasetById,
  getDatasetPaths,
  putDatasetById,
  postCreateDataset
} from '@/web/core/dataset/api';
import { checkTeamExportDatasetLimit } from '@/web/support/user/team/api';
import { useTranslation } from 'next-i18next';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { serviceSideProps } from '@/web/common/utils/i18n';
import dynamic from 'next/dynamic';
import {
  FolderAvatarSrc,
  DatasetTypeEnum,
  DatasetTypeMap
} from '@fastgpt/global/core/dataset/constant';
import MyMenu from '@/components/MyMenu';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import EditFolderModal, { useEditFolder } from '../component/EditFolderModal';
import { useDrag } from '@/web/common/hooks/useDrag';
import { useUserStore } from '@/web/support/user/useUserStore';
import PermissionIconText from '@/components/support/permission/IconText';
import { PermissionTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import ParentPaths from '@/components/common/ParentPaths';
import DatasetTypeTag from '@/components/core/dataset/DatasetTypeTag';

const CreateModal = dynamic(() => import('./component/CreateModal'), { ssr: false });
const MoveModal = dynamic(() => import('./component/MoveModal'), { ssr: false });

const Kb = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { parentId } = router.query as { parentId: string };
  const { setLoading } = useSystemStore();
  const { userInfo } = useUserStore();

  const DeleteTipsMap = useRef({
    [DatasetTypeEnum.folder]: t('dataset.deleteFolderTips'),
    [DatasetTypeEnum.dataset]: t('core.dataset.Delete Confirm'),
    [DatasetTypeEnum.websiteDataset]: t('core.dataset.Delete Confirm')
  });

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });
  const { myDatasets, loadDatasets, setDatasets, updateDataset } = useDatasetStore();
  const { onOpenModal: onOpenTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('Rename')
  });
  const { moveDataId, setMoveDataId, dragStartId, setDragStartId, dragTargetId, setDragTargetId } =
    useDrag();

  const {
    isOpen: isOpenCreateModal,
    onOpen: onOpenCreateModal,
    onClose: onCloseCreateModal
  } = useDisclosure();
  const { editFolderData, setEditFolderData } = useEditFolder();

  /* 点击删除 */
  const { mutate: onclickDelDataset } = useRequest({
    mutationFn: async (id: string) => {
      setLoading(true);
      await delDatasetById(id);
      return id;
    },
    onSuccess(id: string) {
      setDatasets(myDatasets.filter((item) => item._id !== id));
    },
    onSettled() {
      setLoading(false);
    },
    successToast: t('common.Delete Success'),
    errorToast: t('dataset.Delete Dataset Error')
  });
  // check export limit
  const { mutate: exportDataset } = useRequest({
    mutationFn: async (dataset: DatasetItemType) => {
      setLoading(true);
      await checkTeamExportDatasetLimit(dataset._id);
      const a = document.createElement('a');
      a.href = `/api/core/dataset/exportAll?datasetId=${dataset._id}`;
      a.download = `${dataset.name}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    onSettled() {
      setLoading(false);
    },
    errorToast: t('dataset.Export Dataset Limit Error')
  });

  const { data, refetch, isFetching } = useQuery(['loadDataset', parentId], () => {
    return Promise.all([loadDatasets(parentId), getDatasetPaths(parentId)]);
  });

  const paths = data?.[1] || [];

  const formatDatasets = useMemo(
    () =>
      myDatasets.map((item) => {
        return {
          ...item,
          label: DatasetTypeMap[item.type]?.label,
          icon: DatasetTypeMap[item.type]?.icon
        };
      }),
    [myDatasets]
  );

  return (
    <PageContainer isLoading={isFetching} insertProps={{ px: [5, '48px'] }}>
      <Flex pt={[4, '30px']} alignItems={'center'} justifyContent={'space-between'}>
        {/* url path */}
        <ParentPaths
          paths={paths.map((path, i) => ({
            parentId: path.parentId,
            parentName: path.parentName
          }))}
          FirstPathDom={
            <Flex flex={1} alignItems={'center'}>
              <Image src={'/imgs/module/db.png'} alt={''} mr={2} h={'24px'} />
              <Box className="textlg" letterSpacing={1} fontSize={'24px'} fontWeight={'bold'}>
                {t('core.dataset.My Dataset')}
              </Box>
            </Flex>
          }
          onClick={(e) => {
            router.push({
              query: {
                parentId: e
              }
            });
          }}
        />
        {/* create icon */}
        {userInfo?.team?.canWrite && (
          <MyMenu
            offset={[-30, 10]}
            width={120}
            Button={
              <Button variant={'primaryOutline'} px={0}>
                <MenuButton h={'100%'}>
                  <Flex alignItems={'center'} px={'20px'}>
                    <AddIcon mr={2} />
                    <Box>{t('Create New')}</Box>
                  </Flex>
                </MenuButton>
              </Button>
            }
            menuList={[
              {
                child: (
                  <Flex>
                    <Image src={FolderAvatarSrc} alt={''} w={'20px'} mr={1} />
                    {t('Folder')}
                  </Flex>
                ),
                onClick: () => setEditFolderData({})
              },
              {
                child: (
                  <Flex>
                    <Image src={'/imgs/module/db.png'} alt={''} w={'20px'} mr={1} />
                    {t('core.dataset.Dataset')}
                  </Flex>
                ),
                onClick: onOpenCreateModal
              }
            ]}
          />
        )}
      </Flex>
      <Grid
        py={5}
        gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']}
        gridGap={5}
        userSelect={'none'}
      >
        {formatDatasets.map((dataset) => (
          <Box
            display={'flex'}
            flexDirection={'column'}
            key={dataset._id}
            py={3}
            px={5}
            cursor={'pointer'}
            borderWidth={1.5}
            borderColor={dragTargetId === dataset._id ? 'primary.600' : 'borderColor.low'}
            bg={'white'}
            borderRadius={'md'}
            minH={'130px'}
            position={'relative'}
            data-drag-id={dataset.type === DatasetTypeEnum.folder ? dataset._id : undefined}
            draggable
            onDragStart={(e) => {
              setDragStartId(dataset._id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              const targetId = e.currentTarget.getAttribute('data-drag-id');
              if (!targetId) return;
              DatasetTypeEnum.folder && setDragTargetId(targetId);
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
                await putDatasetById({
                  id: dragStartId,
                  parentId: dragTargetId
                });
                refetch();
              } catch (error) {}
              setDragTargetId(undefined);
            }}
            _hover={{
              borderColor: 'primary.300',
              boxShadow: '1.5',
              '& .delete': {
                display: 'block'
              }
            }}
            onClick={() => {
              if (dataset.type === DatasetTypeEnum.folder) {
                router.push({
                  pathname: '/dataset/list',
                  query: {
                    parentId: dataset._id
                  }
                });
              } else {
                router.push({
                  pathname: '/dataset/detail',
                  query: {
                    datasetId: dataset._id
                  }
                });
              }
            }}
          >
            {userInfo?.team.canWrite && dataset.isOwner && (
              <MyMenu
                offset={[-30, 10]}
                width={120}
                Button={
                  <MenuButton
                    position={'absolute'}
                    top={3}
                    right={3}
                    w={'22px'}
                    h={'22px'}
                    borderRadius={'md'}
                    _hover={{
                      color: 'primary.500',
                      '& .icon': {
                        bg: 'myGray.100'
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
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
                  ...(dataset.permission === PermissionTypeEnum.private
                    ? [
                        {
                          child: (
                            <Flex alignItems={'center'}>
                              <MyIcon name={'support/permission/publicLight'} w={'14px'} mr={2} />
                              {t('permission.Set Public')}
                            </Flex>
                          ),
                          onClick: () => {
                            updateDataset({
                              id: dataset._id,
                              permission: PermissionTypeEnum.public
                            });
                          }
                        }
                      ]
                    : [
                        {
                          child: (
                            <Flex alignItems={'center'}>
                              <MyIcon name={'support/permission/privateLight'} w={'14px'} mr={2} />
                              {t('permission.Set Private')}
                            </Flex>
                          ),
                          onClick: () => {
                            updateDataset({
                              id: dataset._id,
                              permission: PermissionTypeEnum.private
                            });
                          }
                        }
                      ]),
                  {
                    child: (
                      <Flex alignItems={'center'}>
                        <MyIcon name={'edit'} w={'14px'} mr={2} />
                        {t('Rename')}
                      </Flex>
                    ),
                    onClick: () =>
                      onOpenTitleModal({
                        defaultVal: dataset.name,
                        onSuccess: (val) => {
                          if (val === dataset.name || !val) return;
                          updateDataset({ id: dataset._id, name: val });
                        }
                      })
                  },
                  {
                    child: (
                      <Flex alignItems={'center'}>
                        <MyIcon name={'common/file/move'} w={'14px'} mr={2} />
                        {t('Move')}
                      </Flex>
                    ),
                    onClick: () => setMoveDataId(dataset._id)
                  },
                  {
                    child: (
                      <Flex alignItems={'center'}>
                        <MyIcon name={'export'} w={'14px'} mr={2} />
                        {t('Export')}
                      </Flex>
                    ),
                    onClick: () => {
                      exportDataset(dataset);
                    }
                  },
                  {
                    child: (
                      <Flex alignItems={'center'}>
                        <MyIcon name={'delete'} w={'14px'} mr={2} />
                        {t('common.Delete')}
                      </Flex>
                    ),
                    onClick: () => {
                      openConfirm(
                        () => onclickDelDataset(dataset._id),
                        undefined,
                        DeleteTipsMap.current[dataset.type]
                      )();
                    }
                  }
                ]}
              />
            )}
            <Flex alignItems={'center'} h={'38px'}>
              <Avatar src={dataset.avatar} borderRadius={'md'} w={'28px'} />
              <Box mx={3} className="textEllipsis3">
                {dataset.name}
              </Box>
            </Flex>
            <Box
              flex={1}
              className={'textEllipsis3'}
              py={1}
              wordBreak={'break-all'}
              fontSize={'sm'}
              color={'myGray.500'}
            >
              {dataset.intro || t('core.dataset.Intro Placeholder')}
            </Box>
            <Flex alignItems={'center'} fontSize={'sm'}>
              <Box flex={1}>
                <PermissionIconText permission={dataset.permission} color={'myGray.600'} />
              </Box>
              {dataset.type !== DatasetTypeEnum.folder && (
                <DatasetTypeTag type={dataset.type} py={1} px={2} />
              )}
            </Flex>
          </Box>
        ))}
      </Grid>
      {myDatasets.length === 0 && (
        <Flex mt={'35vh'} flexDirection={'column'} alignItems={'center'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            {t('core.dataset.Empty Dataset Tips')}
          </Box>
        </Flex>
      )}
      <ConfirmModal />
      <EditTitleModal />
      {isOpenCreateModal && <CreateModal onClose={onCloseCreateModal} parentId={parentId} />}
      {!!editFolderData && (
        <EditFolderModal
          onClose={() => setEditFolderData(undefined)}
          editCallback={async (name) => {
            try {
              await postCreateDataset({
                parentId,
                name,
                type: DatasetTypeEnum.folder,
                avatar: FolderAvatarSrc,
                intro: ''
              });
              refetch();
            } catch (error) {
              return Promise.reject(error);
            }
          }}
          isEdit={false}
        />
      )}
      {!!moveDataId && (
        <MoveModal
          moveDataId={moveDataId}
          onClose={() => setMoveDataId('')}
          onSuccess={() => {
            refetch();
            setMoveDataId('');
          }}
        />
      )}
    </PageContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}

export default Kb;
