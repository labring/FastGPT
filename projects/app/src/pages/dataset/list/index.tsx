import React, { useState } from 'react';
import { Box, Flex, Image, Button, useDisclosure } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import PageContainer from '@/components/PageContainer';
import { useTranslation } from 'next-i18next';
import { serviceSideProps } from '@/web/common/utils/i18n';
import ParentPaths from '@/components/common/folder/Path';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import List from './component/List';
import { DatasetsContext } from './context';
import DatasetContextProvider from './context';
import { useContextSelector } from 'use-context-selector';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { AddIcon } from '@chakra-ui/icons';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FolderIcon, FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import dynamic from 'next/dynamic';
import { postCreateDataset, putDatasetById } from '@/web/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import FolderSlideCard from '@/components/common/folder/SlideCard';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  DatasetDefaultPermissionVal,
  DatasetPermissionList
} from '@fastgpt/global/support/permission/dataset/constant';
import {
  postUpdateDatasetCollaborators,
  deleteDatasetCollaborators,
  getCollaboratorList
} from '@/web/core/dataset/api/collaborator';

const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);

const CreateModal = dynamic(() => import('./component/CreateModal'));

const Dataset = () => {
  const { isPc } = useSystemStore();
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId } = router.query as { parentId: string };

  const { myDatasets } = useDatasetStore();

  const {
    paths,
    isFetchingDatasets,
    refetchPaths,
    refetchDatasets,
    folderDetail,
    setEditedDataset,
    setMoveDatasetId,
    onDelDataset
  } = useContextSelector(DatasetsContext, (v) => v);
  const { userInfo } = useUserStore();

  const [editFolderData, setEditFolderData] = useState<EditFolderFormType>();

  const {
    isOpen: isOpenCreateModal,
    onOpen: onOpenCreateModal,
    onClose: onCloseCreateModal
  } = useDisclosure();

  return (
    <PageContainer
      isLoading={myDatasets.length === 0 && isFetchingDatasets}
      insertProps={{ px: folderDetail ? [4, 6] : [5, '10'] }}
    >
      <Flex pt={[4, 6]}>
        <Flex flexGrow={1} flexDirection="column">
          <Flex alignItems={'flex-start'} justifyContent={'space-between'}>
            <ParentPaths
              paths={paths}
              FirstPathDom={
                <Flex flex={1} alignItems={'center'}>
                  <Image src={'/imgs/workflow/db.png'} alt={''} mr={2} h={'24px'} />
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
            {userInfo?.team?.permission.hasWritePer && (
              <MyMenu
                offset={[-30, 5]}
                width={120}
                Button={
                  <Button variant={'primary'} px="0">
                    <Flex alignItems={'center'} px={'20px'}>
                      <AddIcon mr={2} />
                      <Box>{t('common.Create New')}</Box>
                    </Flex>
                  </Button>
                }
                menuList={[
                  {
                    children: [
                      {
                        label: (
                          <Flex>
                            <MyIcon name={FolderIcon} w={'20px'} mr={1} />
                            {t('Folder')}
                          </Flex>
                        ),
                        onClick: () => setEditFolderData({})
                      },
                      {
                        label: (
                          <Flex>
                            <Image src={'/imgs/workflow/db.png'} alt={''} w={'20px'} mr={1} />
                            {t('core.dataset.Dataset')}
                          </Flex>
                        ),
                        onClick: onOpenCreateModal
                      }
                    ]
                  }
                ]}
              />
            )}
          </Flex>
          <Box flexGrow={1}>
            <List />
          </Box>
        </Flex>

        {!!folderDetail && isPc && (
          <Box ml="6">
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
              onMove={() => setMoveDatasetId(folderDetail._id)}
              deleteTip={t('dataset.deleteFolderTips')}
              onDelete={() =>
                onDelDataset(folderDetail._id).then(() => {
                  router.replace({
                    query: {
                      ...router.query,
                      parentId: folderDetail.parentId
                    }
                  });
                })
              }
              defaultPer={{
                value: folderDetail.defaultPermission,
                defaultValue: DatasetDefaultPermissionVal,
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

      {!!editFolderData && (
        <EditFolderModal
          onClose={() => setEditFolderData(undefined)}
          onCreate={async ({ name }) => {
            try {
              await postCreateDataset({
                parentId: parentId || undefined,
                name,
                type: DatasetTypeEnum.folder,
                avatar: FolderImgUrl,
                intro: ''
              });
              refetchDatasets();
              refetchPaths();
            } catch (error) {
              return Promise.reject(error);
            }
          }}
          onEdit={async ({ name, intro, id }) => {
            try {
              await putDatasetById({
                id,
                name,
                intro
              });
              refetchDatasets();
              refetchPaths();
            } catch (error) {
              return Promise.reject(error);
            }
          }}
        />
      )}
      {isOpenCreateModal && (
        <CreateModal onClose={onCloseCreateModal} parentId={parentId || undefined} />
      )}
    </PageContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dataset']))
    }
  };
}

function DatasetContextWrapper() {
  return (
    <DatasetContextProvider>
      <Dataset />
    </DatasetContextProvider>
  );
}

export default DatasetContextWrapper;
