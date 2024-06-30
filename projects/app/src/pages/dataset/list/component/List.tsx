import React, { useMemo, useRef, useState } from 'react';
import { putDatasetById } from '@/web/core/dataset/api';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { Box, Flex, Grid } from '@chakra-ui/react';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
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
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { DatasetsContext } from '../context';
import {
  DatasetDefaultPermissionVal,
  DatasetPermissionList
} from '@fastgpt/global/support/permission/dataset/constant';
import ConfigPerModal from '@/components/support/permission/ConfigPerModal';
import {
  deleteDatasetCollaborators,
  getCollaboratorList,
  postUpdateDatasetCollaborators
} from '@/web/core/dataset/api/collaborator';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useI18n } from '@/web/context/I18n';
import { useTranslation } from 'react-i18next';

function List() {
  const { setLoading } = useSystemStore();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { commonT } = useI18n();
  const {
    refetchDatasets,
    setMoveDatasetId,
    refetchPaths,
    refetchFolderDetail,
    editedDataset,
    setEditedDataset,
    onDelDataset
  } = useContextSelector(DatasetsContext, (v) => v);
  const [editPerDatasetIndex, setEditPerDatasetIndex] = useState<number>();
  const { myDatasets, loadMyDatasets } = useDatasetStore();
  const [loadingDatasetId, setLoadingDatasetId] = useState<string>();

  const { getBoxProps } = useFolderDrag({
    activeStyles: {
      borderColor: 'primary.600'
    },
    onDrop: async (dragId: string, targetId: string) => {
      setLoadingDatasetId(dragId);
      try {
        await putDatasetById({
          id: dragId,
          parentId: targetId
        });
        refetchDatasets();
      } catch (error) {}
      setLoadingDatasetId(undefined);
    }
  });

  const editPerDataset = useMemo(
    () => (editPerDatasetIndex !== undefined ? myDatasets[editPerDatasetIndex] : undefined),
    [editPerDatasetIndex, myDatasets]
  );

  const router = useRouter();

  const { parentId = null } = router.query as { parentId?: string | null };

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

  const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));

  const DeleteTipsMap = useRef({
    [DatasetTypeEnum.folder]: t('dataset.deleteFolderTips'),
    [DatasetTypeEnum.dataset]: t('core.dataset.Delete Confirm'),
    [DatasetTypeEnum.websiteDataset]: t('core.dataset.Delete Confirm'),
    [DatasetTypeEnum.externalFile]: t('core.dataset.Delete Confirm')
  });

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

  const onClickDeleteDataset = (id: string) => {
    openConfirm(
      () =>
        onDelDataset(id).then(() => {
          refetchPaths();
          refetchDatasets();
        }),
      undefined,
      DeleteTipsMap.current[DatasetTypeEnum.dataset]
    )();
  };

  return (
    <>
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
              <MyBox
                isLoading={loadingDatasetId === dataset._id}
                display={'flex'}
                flexDirection={'column'}
                py={3}
                px={5}
                cursor={'pointer'}
                borderWidth={1.5}
                bg={'white'}
                borderRadius={'md'}
                minH={'130px'}
                position={'relative'}
                {...getBoxProps({
                  dataId: dataset._id,
                  isFolder: dataset.type === DatasetTypeEnum.folder
                })}
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
                    display={['', 'none']}
                    position={'absolute'}
                    top={3.5}
                    right={4}
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
                              label: commonT('dataset.Edit Info'),
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
                              onClick: () => setMoveDatasetId(dataset._id)
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
                        ...(dataset.type != DatasetTypeEnum.folder
                          ? [
                              {
                                children: [
                                  {
                                    icon: 'export',
                                    label: t('Export'),
                                    onClick: () => {
                                      exportDataset(dataset);
                                    }
                                  }
                                ]
                              }
                            ]
                          : []),
                        ...(dataset.permission.hasManagePer
                          ? [
                              {
                                children: [
                                  {
                                    icon: 'delete',
                                    label: t('common.Delete'),
                                    type: 'danger' as 'danger',
                                    onClick: () => onClickDeleteDataset(dataset._id)
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
              </MyBox>
            </MyTooltip>
          ))}
        </Grid>
      )}
      {myDatasets.length === 0 && (
        <EmptyTip pt={'35vh'} text={t('core.dataset.Empty Dataset Tips')} flexGrow="1"></EmptyTip>
      )}

      {editedDataset && (
        <EditResourceModal
          {...editedDataset}
          title={commonT('dataset.Edit Info')}
          onClose={() => setEditedDataset(undefined)}
          onEdit={async (data) => {
            await putDatasetById({
              id: editedDataset.id,
              name: data.name,
              intro: data.intro,
              avatar: data.avatar
            });
            loadMyDatasets(parentId ? parentId : undefined);
            refetchFolderDetail();
            refetchPaths();
            setEditedDataset(undefined);
          }}
        />
      )}

      {!!editPerDataset && (
        <ConfigPerModal
          avatar={editPerDataset.avatar}
          name={editPerDataset.name}
          defaultPer={{
            value: editPerDataset.defaultPermission,
            defaultValue: DatasetDefaultPermissionVal,
            onChange: async (e) => {
              await putDatasetById({
                id: editPerDataset._id,
                defaultPermission: e
              });
              refetchDatasets();
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
      <ConfirmModal />
    </>
  );
}

export default List;
