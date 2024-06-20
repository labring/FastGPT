import { useDrag } from '@/web/common/hooks/useDrag';
import { delDatasetById, getDatasetById, putDatasetById } from '@/web/core/dataset/api';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { Box, Flex, Grid } from '@chakra-ui/react';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import PermissionIconText from '@/components/support/permission/IconText';
import DatasetTypeTag from '@/components/core/dataset/DatasetTypeTag';
import Avatar from '@/components/Avatar';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { checkTeamExportDatasetLimit } from '@/web/support/user/team/api';
import { downloadFetch } from '@/web/common/system/utils';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import { useContextSelector } from 'use-context-selector';
import { DatasetContext } from '../context';
import {
  DatasetDefaultPermission,
  DatasetPermissionList
} from '@fastgpt/global/support/permission/dataset/constant';
import ConfigPerModal from '@/components/support/permission/ConfigPerModal';
import {
  deleteDatasetCollaborators,
  getCollaboratorList,
  postUpdateDatasetCollaborators
} from '@/web/core/dataset/api/collaborator';
import FolderSlideCard from '@/components/common/folder/SlideCard';
import { useQuery } from '@tanstack/react-query';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const MoveModal = dynamic(() => import('./MoveModal'), { ssr: false });

function List() {
  const { setLoading, isPc } = useSystemStore();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { refetch } = useContextSelector(DatasetContext, (v) => v);
  const [editPerDatasetIndex, setEditPerDatasetIndex] = useState<number>();
  const { myDatasets, loadMyDatasets, setMyDatasets } = useDatasetStore();

  const editPerDataset = useMemo(
    () => (editPerDatasetIndex !== undefined ? myDatasets[editPerDatasetIndex] : undefined),
    [editPerDatasetIndex, myDatasets]
  );

  const router = useRouter();

  const { parentId } = router.query as { parentId: string };

  const { data: folderDetail, refetch: refetchFolderDetail } = useQuery(
    ['folderDetail', parentId, myDatasets],
    () => (parentId ? getDatasetById(parentId) : undefined)
  );

  const { mutate: exportDataset } = useRequest({
    mutationFn: async (dataset: DatasetItemType) => {
      setLoading(true);
      await checkTeamExportDatasetLimit(dataset._id);

      await downloadFetch({
        url: `/api/core/dataset/exportAll?datasetId=${dataset._id}`,
        filename: `${dataset.name}.csv`
      });
    },
    onSuccess() {
      toast({
        status: 'success',
        title: t('core.dataset.Start export')
      });
    },
    onSettled() {
      setLoading(false);
    },
    errorToast: t('dataset.Export Dataset Limit Error')
  });

  const { mutate: onclickDelDataset } = useRequest({
    mutationFn: async (id: string) => {
      setLoading(true);
      await delDatasetById(id);
      return id;
    },
    onSuccess(id: string) {
      setMyDatasets(myDatasets.filter((item) => item._id !== id));
    },
    onSettled() {
      setLoading(false);
    },
    successToast: t('common.Delete Success'),
    errorToast: t('dataset.Delete Dataset Error')
  });

  const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
  const [editedDataset, setEditedDataset] = useState<EditResourceInfoFormType>();

  const DeleteTipsMap = useRef({
    [DatasetTypeEnum.folder]: t('dataset.deleteFolderTips'),
    [DatasetTypeEnum.dataset]: t('core.dataset.Delete Confirm'),
    [DatasetTypeEnum.websiteDataset]: t('core.dataset.Delete Confirm'),
    [DatasetTypeEnum.externalFile]: t('core.dataset.Delete Confirm')
  });

  const { moveDataId, setMoveDataId, dragStartId, setDragStartId, dragTargetId, setDragTargetId } =
    useDrag();

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

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });

  const onDeleteDataset = (id: string) => {
    openConfirm(
      () => onclickDelDataset(id),
      undefined,
      DeleteTipsMap.current[DatasetTypeEnum.dataset]
    )();
  };

  return (
    <>
      <Flex>
        {formatDatasets.length > 0 && (
          <Grid
            flexGrow={1}
            py={5}
            gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']}
            gridGap={5}
            userSelect={'none'}
          >
            {formatDatasets.map((dataset, index) => (
              <MyTooltip
                key={dataset._id}
                label={
                  <Flex flexDirection={'column'} alignItems={'center'}>
                    <Box fontSize={'xs'} color={'myGray.500'}>
                      {dataset.type === DatasetTypeEnum.folder ? '打开文件夹' : '打开知识库'}
                    </Box>
                  </Flex>
                }
              >
                <Box
                  display={'flex'}
                  flexDirection={'column'}
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
                  onDragStart={() => {
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
                    },
                    '& .more': {
                      display: 'flex'
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
                  {dataset.permission.hasWritePer && (
                    <Box
                      className="more"
                      display="none"
                      position={'absolute'}
                      top={3}
                      right={3}
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
                      <MyMenu
                        width={120}
                        Button={
                          <Box w={'22px'} h={'22px'}>
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
                          </Box>
                        }
                        menuList={[
                          {
                            children: [
                              {
                                icon: 'edit',
                                label: '编辑信息',
                                onClick: () =>
                                  setEditedDataset({
                                    id: dataset._id,
                                    name: dataset.name,
                                    intro: dataset.intro,
                                    avatar: dataset.avatar
                                  })
                              },
                              {
                                icon: 'common/file/move',
                                label: t('Move'),
                                onClick: () => setMoveDataId(dataset._id)
                              },
                              {
                                icon: 'export',
                                label: t('Export'),
                                onClick: () => {
                                  exportDataset(dataset);
                                }
                              },
                              ...(dataset.permission.hasManagePer
                                ? [
                                    {
                                      icon: 'support/team/key',
                                      label: t('permission.Permission'),
                                      onClick: () => setEditPerDatasetIndex(index)
                                    }
                                  ]
                                : [])
                            ]
                          },
                          ...(dataset.permission.hasManagePer
                            ? [
                                {
                                  children: [
                                    {
                                      icon: 'delete',
                                      label: t('common.Delete'),
                                      type: 'danger' as 'danger',
                                      onClick: () => {
                                        openConfirm(
                                          () => onclickDelDataset(dataset._id),
                                          undefined,
                                          DeleteTipsMap.current[dataset.type]
                                        )();
                                      }
                                    }
                                  ]
                                }
                              ]
                            : [])
                        ]}
                      />
                    </Box>
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
                    fontSize={'xs'}
                    color={'myGray.500'}
                  >
                    {dataset.intro ||
                      (dataset.type === DatasetTypeEnum.folder
                        ? t('core.dataset.Folder placeholder')
                        : t('core.dataset.Intro Placeholder'))}
                  </Box>
                  <Flex alignItems={'center'} fontSize={'sm'}>
                    <Box flex={1}>
                      <PermissionIconText
                        defaultPermission={dataset.defaultPermission}
                        color={'myGray.600'}
                      />
                    </Box>
                    {dataset.type !== DatasetTypeEnum.folder && (
                      <DatasetTypeTag type={dataset.type} py={1} px={2} />
                    )}
                  </Flex>
                </Box>
              </MyTooltip>
            ))}
          </Grid>
        )}
        {myDatasets.length === 0 && (
          <EmptyTip pt={'35vh'} text={t('core.dataset.Empty Dataset Tips')} flexGrow="1"></EmptyTip>
        )}

        {!!folderDetail && isPc && (
          <Box pt={[4, 6]} ml={[4, 6]}>
            <FolderSlideCard
              refreshDeps={[folderDetail._id]}
              name={folderDetail.name}
              intro={folderDetail.intro}
              onEdit={() => {
                setEditedDataset({
                  id: folderDetail._id,
                  name: folderDetail.name,
                  intro: folderDetail.intro
                });
              }}
              onMove={() => setMoveDataId(folderDetail._id)}
              deleteTip={t('dataset.deleteFolderTips')}
              onDelete={() => onDeleteDataset(folderDetail._id)}
              defaultPer={{
                value: folderDetail.defaultPermission,
                defaultValue: DatasetDefaultPermission,
                onChange: (e) => {
                  return putDatasetById({
                    id: folderDetail._id,
                    defaultPermission: e
                  });
                }
              }}
              managePer={{
                permission: folderDetail.permission,
                onGetCollaboratorList: () => getCollaboratorList(folderDetail._id),
                permissionList: DatasetPermissionList,
                onUpdateCollaborators: ({
                  tmbIds,
                  permission
                }: {
                  tmbIds: string[];
                  permission: number;
                }) => {
                  return postUpdateDatasetCollaborators({
                    tmbIds,
                    permission,
                    datasetId: folderDetail._id
                  });
                },
                onDelOneCollaborator: (tmbId: string) =>
                  deleteDatasetCollaborators({
                    datasetId: folderDetail._id,
                    tmbId
                  })
              }}
            />
          </Box>
        )}
      </Flex>

      <ConfirmModal />

      {editedDataset && (
        <EditResourceModal
          {...editedDataset}
          title={''}
          onClose={() => setEditedDataset(undefined)}
          onEdit={async (data) => {
            await putDatasetById({
              id: editedDataset.id,
              name: data.name,
              intro: data.intro,
              avatar: data.avatar
            });
            loadMyDatasets(parentId);
            refetchFolderDetail();
            setEditedDataset(undefined);
          }}
        />
      )}

      {!!moveDataId && (
        <MoveModal
          moveDataId={moveDataId}
          onClose={() => setMoveDataId('')}
          onSuccess={() => {
            refetch();
            refetchFolderDetail();
            setMoveDataId('');
          }}
        />
      )}

      {!!editPerDataset && (
        <ConfigPerModal
          avatar={editPerDataset.avatar}
          name={editPerDataset.name}
          defaultPer={{
            value: editPerDataset.defaultPermission,
            defaultValue: DatasetDefaultPermission,
            onChange: async (e) => {
              await putDatasetById({
                id: editPerDataset._id,
                defaultPermission: e
              });
              refetch();
            }
          }}
          managePer={{
            permission: editPerDataset.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerDataset._id),
            permissionList: DatasetPermissionList,
            onUpdateCollaborators: ({
              tmbIds,
              permission
            }: {
              tmbIds: string[];
              permission: number;
            }) => {
              return postUpdateDatasetCollaborators({
                tmbIds,
                permission,
                datasetId: editPerDataset._id
              });
            },
            onDelOneCollaborator: (tmbId: string) =>
              deleteDatasetCollaborators({
                datasetId: editPerDataset._id,
                tmbId
              })
          }}
          onClose={() => setEditPerDatasetIndex(undefined)}
        />
      )}
    </>
  );
}

export default List;
