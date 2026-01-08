import React, { useMemo, useRef, useState } from 'react';
import { postChangeOwner, resumeInheritPer } from '@/web/core/dataset/api';
import { Box, Flex, Grid, HStack } from '@chakra-ui/react';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import PermissionIconText from '@/components/support/permission/IconText';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { checkTeamExportDatasetLimit } from '@/web/support/user/team/api';
import { downloadFetch } from '@/web/common/system/utils';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { DatasetsContext } from '../../../pages/dataset/list/context';
import { DatasetRoleList } from '@fastgpt/global/support/permission/dataset/constant';
import ConfigPerModal from '@/components/support/permission/ConfigPerModal';
import {
  deleteDatasetCollaborators,
  getCollaboratorList,
  postUpdateDatasetCollaborators
} from '@/web/core/dataset/api/collaborator';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import SideTag from './SideTag';
import UserBox from '@fastgpt/web/components/common/UserBox';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));

function List() {
  const { setLoading, getModelProvider } = useSystemStore();
  const { isPc } = useSystem();
  const { t } = useTranslation();
  const {
    loadMyDatasets,
    setMoveDatasetId,
    refetchPaths,
    editedDataset,
    setEditedDataset,
    onDelDataset,
    onUpdateDataset,
    myDatasets,
    folderDetail,
    setSearchKey
  } = useContextSelector(DatasetsContext, (v) => v);
  const [editPerDatasetId, setEditPerDatasetId] = useState<string>();
  const router = useRouter();
  const { parentId = null } = router.query as { parentId?: string | null };
  const parentDataset = useMemo(
    () => myDatasets.find((item) => item._id === parentId),
    [parentId, myDatasets]
  );

  const { openConfirm: openMoveConfirm, ConfirmModal: MoveConfirmModal } = useConfirm({
    type: 'common',
    title: t('common:move.confirm'),
    content: t('dataset:move.hint')
  });

  const { runAsync: updateDataset } = useRequest2(onUpdateDataset);

  const { getBoxProps } = useFolderDrag({
    activeStyles: {
      borderColor: 'primary.600'
    },
    onDrop: (dragId: string, targetId: string) => {
      openMoveConfirm({
        onConfirm: () =>
          updateDataset({
            id: dragId,
            parentId: targetId
          })
      })();
    }
  });

  const editPerDataset = useMemo(
    () => myDatasets.find((item) => item._id === editPerDatasetId),
    [editPerDatasetId, myDatasets]
  );

  const { runAsync: exportDataset } = useRequest2(
    async ({ _id, name }: { _id: string; name: string }) => {
      await checkTeamExportDatasetLimit(_id);

      await downloadFetch({
        url: `/api/core/dataset/exportAll?datasetId=${_id}`,
        filename: `${name}.csv`
      });
    },
    {
      manual: true,
      onBefore: () => {
        setLoading(true);
      },
      onFinally() {
        setLoading(false);
      },
      successToast: t('common:core.dataset.Start export'),
      errorToast: t('common:dataset.Export Dataset Limit Error')
    }
  );

  const DeleteTipsMap = useRef({
    [DatasetTypeEnum.folder]: t('common:dataset.deleteFolderTips'),
    [DatasetTypeEnum.dataset]: t('common:core.dataset.Delete Confirm'),
    [DatasetTypeEnum.websiteDataset]: t('common:core.dataset.Delete Confirm'),
    [DatasetTypeEnum.externalFile]: t('common:core.dataset.Delete Confirm')
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

  return (
    <>
      {formatDatasets.length > 0 && (
        <Grid
          py={4}
          gridTemplateColumns={
            folderDetail
              ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']
              : ['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
          }
          gridGap={5}
          alignItems={'stretch'}
        >
          {formatDatasets.map((dataset, index) => {
            const vectorModelAvatar = getModelProvider(dataset.vectorModel.provider)?.avatar;

            return (
              <MyTooltip
                key={dataset._id}
                label={
                  <Flex flexDirection={'column'} alignItems={'center'}>
                    <Box fontSize={'xs'} color={'myGray.500'}>
                      {dataset.type === DatasetTypeEnum.folder
                        ? t('common:open_folder')
                        : t('common:folder.open_dataset')}
                    </Box>
                  </Flex>
                }
              >
                <MyBox
                  display={'flex'}
                  flexDirection={'column'}
                  lineHeight={1.5}
                  h="100%"
                  pt={5}
                  pb={3}
                  px={5}
                  cursor={'pointer'}
                  borderWidth={1.5}
                  border={'base'}
                  boxShadow={'2'}
                  bg={'white'}
                  borderRadius={'lg'}
                  position={'relative'}
                  minH={'150px'}
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
                    },
                    '& .time': {
                      display: ['flex', 'none']
                    }
                  }}
                  onClick={() => {
                    if (dataset.type === DatasetTypeEnum.folder) {
                      setSearchKey('');
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
                  <Flex w="100%">
                    <Avatar src={dataset.avatar} borderRadius={6} w={'28px'} flexShrink={0} />
                    <Box width="0" flex="1" className="textEllipsis" color={'myGray.900'} ml={2}>
                      {dataset.name}
                    </Box>

                    {dataset.type !== DatasetTypeEnum.folder && (
                      <Box flexShrink={0} mr={-5}>
                        <SideTag
                          type={dataset.type}
                          py={0.5}
                          px={2}
                          borderLeftRadius={'sm'}
                          borderRightRadius={0}
                        />
                      </Box>
                    )}
                  </Flex>

                  <Box
                    flex={1}
                    className={'textEllipsis3'}
                    whiteSpace={'pre-wrap'}
                    py={3}
                    fontSize={'xs'}
                    color={'myGray.500'}
                  >
                    {dataset.intro ||
                      (dataset.type === DatasetTypeEnum.folder
                        ? t('common:core.dataset.Folder placeholder')
                        : t('common:core.dataset.Intro Placeholder'))}
                  </Box>

                  <Flex
                    h={'24px'}
                    alignItems={'center'}
                    justifyContent={'space-between'}
                    fontSize={'sm'}
                    fontWeight={500}
                    color={'myGray.500'}
                  >
                    <HStack spacing={3.5}>
                      <UserBox
                        sourceMember={dataset.sourceMember}
                        fontSize="xs"
                        avatarSize="1rem"
                        spacing={0.5}
                      />
                      <PermissionIconText
                        flexShrink={0}
                        private={dataset.private}
                        iconColor="myGray.400"
                        color={'myGray.500'}
                      />
                    </HStack>

                    <HStack>
                      {isPc && dataset.type !== DatasetTypeEnum.folder && (
                        <HStack spacing={1} className="time">
                          <Avatar src={vectorModelAvatar} w={'0.85rem'} />
                          <Box color={'myGray.500'} fontSize={'mini'}>
                            {dataset.vectorModel.name}
                          </Box>
                        </HStack>
                      )}
                      {(dataset.type === DatasetTypeEnum.folder
                        ? dataset.permission.hasManagePer
                        : dataset.permission.hasWritePer) && (
                        <Box
                          className="more"
                          display={['', 'none']}
                          borderRadius={'md'}
                          _hover={{
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
                                    label: t('common:dataset.Edit Info'),
                                    onClick: () =>
                                      setEditedDataset({
                                        id: dataset._id,
                                        name: dataset.name,
                                        intro: dataset.intro,
                                        avatar: dataset.avatar
                                      })
                                  },
                                  ...((parentDataset ? parentDataset : dataset)?.permission
                                    .hasManagePer
                                    ? [
                                        {
                                          icon: 'common/file/move',
                                          label: t('common:Move'),
                                          onClick: () => {
                                            setMoveDatasetId(dataset._id);
                                          }
                                        }
                                      ]
                                    : []),
                                  ...(dataset.permission.hasManagePer
                                    ? [
                                        {
                                          icon: 'key',
                                          label: t('common:permission.Permission'),
                                          onClick: () => setEditPerDatasetId(dataset._id)
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
                                          label: t('common:Export'),
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
                                          label: t('common:Delete'),
                                          type: 'danger' as 'danger',
                                          onClick: () =>
                                            openConfirm({
                                              onConfirm: () =>
                                                onDelDataset(dataset._id).then(() => {
                                                  refetchPaths();
                                                  loadMyDatasets();
                                                }),
                                              customContent:
                                                DeleteTipsMap.current[DatasetTypeEnum.dataset],
                                              inputConfirmText: dataset.name
                                            })()
                                        }
                                      ]
                                    }
                                  ]
                                : [])
                            ]}
                          />
                        </Box>
                      )}
                    </HStack>
                  </Flex>
                </MyBox>
              </MyTooltip>
            );
          })}
        </Grid>
      )}
      {myDatasets.length === 0 && (
        <EmptyTip
          pt={'35vh'}
          text={t('common:core.dataset.Empty Dataset Tips')}
          flexGrow="1"
        ></EmptyTip>
      )}

      {editedDataset && (
        <EditResourceModal
          {...editedDataset}
          title={t('common:dataset.Edit Info')}
          onClose={() => setEditedDataset(undefined)}
          onEdit={async (data) => {
            await onUpdateDataset({
              id: editedDataset.id,
              name: data.name,
              intro: data.intro,
              avatar: data.avatar
            });
          }}
        />
      )}

      {!!editPerDataset && (
        <ConfigPerModal
          onChangeOwner={(tmbId: string) =>
            postChangeOwner({
              datasetId: editPerDataset._id,
              ownerId: tmbId
            }).then(() => loadMyDatasets())
          }
          hasParent={!!parentId}
          refetchResource={loadMyDatasets}
          isInheritPermission={editPerDataset.inheritPermission}
          resumeInheritPermission={() =>
            resumeInheritPer(editPerDataset._id).then(() => Promise.all([loadMyDatasets()]))
          }
          avatar={editPerDataset.avatar}
          name={editPerDataset.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: editPerDataset.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerDataset._id),
            roleList: DatasetRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateDatasetCollaborators({
                ...props,
                datasetId: editPerDataset._id
              }),
            onDelOneCollaborator: async (props) =>
              deleteDatasetCollaborators({
                ...props,
                datasetId: editPerDataset._id
              }),
            refreshDeps: [editPerDataset._id, editPerDataset.inheritPermission]
          }}
          onClose={() => setEditPerDatasetId(undefined)}
        />
      )}
      <ConfirmModal />
      <MoveConfirmModal />
    </>
  );
}

export default List;
