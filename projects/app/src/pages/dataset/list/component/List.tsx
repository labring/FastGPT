import React, { useMemo, useRef, useState } from 'react';
import { resumeInheritPer } from '@/web/core/dataset/api';
import { Box, Flex, Grid, HStack } from '@chakra-ui/react';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import PermissionIconText from '@/components/support/permission/IconText';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { checkTeamExportDatasetLimit } from '@/web/support/user/team/api';
import { downloadFetch } from '@/web/common/system/utils';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { DatasetsContext } from '../context';
import { DatasetPermissionList } from '@fastgpt/global/support/permission/dataset/constant';
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
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import SideTag from './SideTag';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));

function List() {
  const { setLoading } = useSystemStore();
  const { isPc } = useSystem();
  const { t } = useTranslation();
  const { commonT } = useI18n();
  const { loadAndGetTeamMembers } = useUserStore();
  const {
    loadMyDatasets,
    setMoveDatasetId,
    refetchPaths,
    editedDataset,
    setEditedDataset,
    onDelDataset,
    onUpdateDataset,
    myDatasets,
    folderDetail
  } = useContextSelector(DatasetsContext, (v) => v);
  const [editPerDatasetIndex, setEditPerDatasetIndex] = useState<number>();
  const router = useRouter();
  const { parentId = null } = router.query as { parentId?: string | null };
  const parentDataset = useMemo(
    () => myDatasets.find((item) => String(item._id) === parentId),
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
      openMoveConfirm(() =>
        updateDataset({
          id: dragId,
          parentId: targetId
        })
      )();
    }
  });

  const { data: members = [] } = useRequest2(loadAndGetTeamMembers, {
    manual: false
  });

  const editPerDataset = useMemo(
    () => (editPerDatasetIndex !== undefined ? myDatasets[editPerDatasetIndex] : undefined),
    [editPerDatasetIndex, myDatasets]
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
    onSettled() {
      setLoading(false);
    },
    successToast: t('common:core.dataset.Start export'),
    errorToast: t('common:dataset.Export Dataset Limit Error')
  });

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

  const onClickDeleteDataset = (id: string) => {
    openConfirm(
      () =>
        onDelDataset(id).then(() => {
          refetchPaths();
          loadMyDatasets();
        }),
      undefined,
      DeleteTipsMap.current[DatasetTypeEnum.dataset]
    )();
  };

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
            const owner = members.find((v) => v.tmbId === dataset.tmbId);
            return (
              <MyTooltip
                key={dataset._id}
                label={
                  <Flex flexDirection={'column'} alignItems={'center'}>
                    <Box fontSize={'xs'} color={'myGray.500'}>
                      {dataset.type === DatasetTypeEnum.folder
                        ? t('common:common.folder.Open folder')
                        : t('common:common.folder.open_dataset')}
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
                  <HStack>
                    <Avatar src={dataset.avatar} borderRadius={6} w={'28px'} />
                    <Box flex={'1 0 0'} className="textEllipsis3" color={'myGray.900'}>
                      {dataset.name}
                    </Box>

                    <Box mr={'-1.25rem'}>
                      {dataset.type !== DatasetTypeEnum.folder && (
                        <SideTag
                          type={dataset.type}
                          py={0.5}
                          px={2}
                          borderLeftRadius={'sm'}
                          borderRightRadius={0}
                        />
                      )}
                    </Box>
                  </HStack>

                  <Box
                    flex={1}
                    className={'textEllipsis3'}
                    py={3}
                    wordBreak={'break-all'}
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
                      {owner && (
                        <HStack spacing={1}>
                          <Avatar src={owner.avatar} w={'0.875rem'} borderRadius={'50%'} />
                          <Box maxW={'150px'} className="textEllipsis" fontSize={'mini'}>
                            {owner.memberName}
                          </Box>
                        </HStack>
                      )}
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
                          <Avatar src={dataset.vectorModel.avatar} w={'0.85rem'} />
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
                                    label: commonT('dataset.Edit Info'),
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
                                          icon: 'support/team/key',
                                          label: t('common:permission.Permission'),
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
                                          label: t('common:common.Delete'),
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
          title={commonT('dataset.Edit Info')}
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
          hasParent={!!parentId}
          refetchResource={loadMyDatasets}
          isInheritPermission={editPerDataset.inheritPermission}
          resumeInheritPermission={() =>
            resumeInheritPer(editPerDataset._id).then(() => Promise.all([loadMyDatasets()]))
          }
          avatar={editPerDataset.avatar}
          name={editPerDataset.name}
          managePer={{
            mode: 'all',
            permission: editPerDataset.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerDataset._id),
            permissionList: DatasetPermissionList,
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
          onClose={() => setEditPerDatasetIndex(undefined)}
        />
      )}
      <ConfirmModal />
      <MoveConfirmModal />
    </>
  );
}

export default List;
