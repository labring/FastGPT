'use client';
import React, { useCallback, useState } from 'react';
import { Box, Flex, Button } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serviceSideProps } from '@/web/common/i18n/utils';
import FolderPath from '@/components/common/folder/Path';
import List from '@/pageComponents/dataset/list/NewList';
import { DatasetsContext } from '@/pageComponents/dataset/list/context';
import DatasetContextProvider from '@/pageComponents/dataset/list/context';
import { useContextSelector } from 'use-context-selector';
import MultipleMenu from '@fastgpt/web/components/common/MyMenu/Multiple';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { type EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import dynamic from 'next/dynamic';
import { postCreateDatasetFolder, resumeInheritPer, postChangeOwner } from '@/web/core/dataset/api';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { DatasetRoleList } from '@fastgpt/global/support/permission/dataset/constant';
import {
  postUpdateDatasetCollaborators,
  deleteDatasetCollaborators,
  getCollaboratorList
} from '@/web/core/dataset/api/collaborator';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { type CreateDatasetType } from '@/pageComponents/dataset/list/CreateModal';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import {
  DashboardNavbar,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH
} from '@/pageComponents/dashboard/Container';
import BgDecoration from '@/pageComponents/dashboard/BgDecoration';

const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);

const CreateModal = dynamic(() => import('@/pageComponents/dataset/list/CreateModal'));

const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

const Dataset = () => {
  const { isPc } = useSystem();
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId } = router.query as { parentId: string };

  const {
    myDatasets,
    paths,
    isFetchingDatasets,
    refetchPaths,
    loadMyDatasets,
    refetchFolderDetail,
    folderDetail,
    onUpdateDataset,
    searchKey,
    setSearchKey,
    setEditedDataset
  } = useContextSelector(DatasetsContext, (v) => v);
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();
  const [editFolderData, setEditFolderData] = useState<EditFolderFormType>();
  const [createDatasetType, setCreateDatasetType] = useState<CreateDatasetType>();
  const [folderPerOpen, setFolderPerOpen] = useState(false);

  const onSelectDatasetType = useCallback(
    (e: CreateDatasetType) => {
      if (!feConfigs?.isPlus && [DatasetTypeEnum.websiteDataset].includes(e)) {
        return toast({
          status: 'warning',
          title: t('common:commercial_function_tip')
        });
      }
      setCreateDatasetType(e);
    },
    [t, toast, feConfigs]
  );

  return (
    <MyBox
      isLoading={myDatasets.length === 0 && isFetchingDatasets}
      flexDirection={'column'}
      h={'100%'}
      overflowY={'auto'}
      overflowX={'hidden'}
    >
      <Flex pt={[4, 6]} px={4}>
        <Flex flexGrow={1} flexDirection="column">
          <Flex alignItems={'center'}>
            <FolderPath
              paths={paths}
              FirstPathDom={
                <Flex flex={1} alignItems={'center'}>
                  <Box
                    pl={2}
                    letterSpacing={1}
                    fontSize={'1.25rem'}
                    fontWeight={'bold'}
                    color={'myGray.900'}
                  >
                    {t('common:core.dataset.My Dataset')}
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
            <Flex flex={1} />
            <Flex alignItems={'center'} gap={3}>
              {isPc && (
                <SearchInput
                  maxW={['auto', '250px']}
                  value={searchKey}
                  bg={'white'}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder={t('dataset:name_or_description')}
                  maxLength={30}
                />
              )}

              {folderDetail && folderDetail.permission.hasManagePer && (
                <Button variant={'whiteBase'} px={5} onClick={() => setFolderPerOpen(true)}>
                  {t('common:permission.Permission')}
                </Button>
              )}
              {folderDetail && folderDetail.permission.hasWritePer && (
                <Button
                  variant={'whiteBase'}
                  px={5}
                  onClick={() =>
                    setEditedDataset({
                      id: folderDetail._id,
                      name: folderDetail.name,
                      intro: folderDetail.intro,
                      avatar: folderDetail.avatar
                    })
                  }
                >
                  {t('common:Edit')}
                </Button>
              )}
              {(folderDetail
                ? folderDetail.permission.hasWritePer
                : userInfo?.team?.permission.hasDatasetCreatePer) && (
                <>
                  <Button variant={'whiteBase'} onClick={() => setEditFolderData({})} px={5}>
                    {t('app:new_folder')}
                  </Button>
                  <MultipleMenu
                    size="md"
                    Trigger={
                      <Button
                        variant={'primary'}
                        leftIcon={<MyIcon name={'common/addLight'} w={'18px'} />}
                      >
                        {t('dataset:new_dataset')}
                      </Button>
                    }
                    menuList={[
                      {
                        children: [
                          {
                            icon: 'core/dataset/commonDatasetColor',
                            label: t('dataset:common_dataset'),
                            description: t('dataset:common_dataset_desc'),
                            onClick: () => onSelectDatasetType(DatasetTypeEnum.dataset)
                          },
                          {
                            icon: 'core/dataset/websiteDatasetColor',
                            label: t('dataset:website_dataset'),
                            description: t('dataset:website_dataset_desc'),
                            onClick: () => onSelectDatasetType(DatasetTypeEnum.websiteDataset)
                          },
                          ...(feConfigs?.show_direct_database === true
                            ? [
                                {
                                  icon: 'core/dataset/datasetDb',
                                  label: t('dataset:database'),
                                  description: t('dataset:build_database_by_import'),
                                  menuList: [
                                    {
                                      children: [
                                        {
                                          icon: 'core/dataset/fileDbColor',
                                          label: t('dataset:file_database'),
                                          description: t('dataset:file_database_desc'),
                                          onClick: () =>
                                            onSelectDatasetType(DatasetTypeEnum.structureDocument)
                                        },
                                        {
                                          icon: 'core/dataset/databaseColor',
                                          label: t('dataset:direct_database'),
                                          description: t('dataset:database_auth_desc'),
                                          onClick: () => onSelectDatasetType(DatasetTypeEnum.database)
                                        }
                                      ]
                                    }
                                  ]
                                }
                              ]
                            : [
                                {
                                  icon: 'core/dataset/fileDbColor',
                                  label: t('dataset:file_database'),
                                  description: t('dataset:file_database_desc'),
                                  onClick: () =>
                                    onSelectDatasetType(DatasetTypeEnum.structureDocument)
                                }
                              ]),
                          {
                            icon: 'core/dataset/otherDataset',
                            label: t('dataset:other_dataset'),
                            description: t('dataset:external_other_dataset_desc'),
                            menuList: [
                              {
                                children: [
                                  {
                                    icon: 'core/dataset/externalDatasetColor',
                                    label: t('dataset:api_file'),
                                    description: t('dataset:external_file_dataset_desc'),
                                    onClick: () => onSelectDatasetType(DatasetTypeEnum.apiDataset)
                                  },
                                  ...(feConfigs?.show_dataset_feishu !== false
                                    ? [
                                        {
                                          icon: 'core/dataset/feishuDatasetColor',
                                          label: t('dataset:feishu_dataset'),
                                          description: t('dataset:feishu_dataset_desc'),
                                          onClick: () => onSelectDatasetType(DatasetTypeEnum.feishu)
                                        }
                                      ]
                                    : []),
                                  ...(feConfigs?.show_dataset_yuque !== false
                                    ? [
                                        {
                                          icon: 'core/dataset/yuqueDatasetColor',
                                          label: t('dataset:yuque_dataset'),
                                          description: t('dataset:yuque_dataset_desc'),
                                          onClick: () => onSelectDatasetType(DatasetTypeEnum.yuque)
                                        }
                                      ]
                                    : [])
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    ]}
                  />
                </>
              )}
            </Flex>
          </Flex>

          {!isPc && (
            <Box mt={2}>
              <SearchInput
                maxW={['auto', '250px']}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                placeholder={t('dataset:name_or_description')}
                maxLength={30}
              />
            </Box>
          )}

          <Box flexGrow={1}>
            <List />
          </Box>
        </Flex>
      </Flex>

      {!!editFolderData && (
        <EditFolderModal
          {...editFolderData}
          onClose={() => setEditFolderData(undefined)}
          getPresignedUrl={getUploadAvatarPresignedUrl}
          onCreate={async ({ name, intro, avatar }) => {
            try {
              await postCreateDatasetFolder({
                parentId: parentId || undefined,
                name,
                intro: intro ?? '',
                avatar
              });
              loadMyDatasets();
              refetchPaths();
            } catch (error) {
              return Promise.reject(error);
            }
          }}
          onEdit={async ({ name, intro, avatar, id }) => {
            try {
              await onUpdateDataset({
                id,
                name,
                intro,
                avatar
              });
            } catch (error) {
              return Promise.reject(error);
            }
          }}
        />
      )}
      {createDatasetType && (
        <CreateModal
          type={createDatasetType}
          onClose={() => setCreateDatasetType(undefined)}
          parentId={parentId || undefined}
        />
      )}
      {folderPerOpen && !!folderDetail && (
        <ConfigPerModal
          onChangeOwner={(tmbId: string) =>
            postChangeOwner({ datasetId: folderDetail._id, ownerId: tmbId }).then(() =>
              Promise.all([refetchFolderDetail(), loadMyDatasets()])
            )
          }
          hasParent={!!folderDetail.parentId}
          refetchResource={() => Promise.all([refetchFolderDetail(), loadMyDatasets()])}
          isInheritPermission={folderDetail.inheritPermission}
          resumeInheritPermission={() =>
            resumeInheritPer(folderDetail._id).then(() =>
              Promise.all([refetchFolderDetail(), loadMyDatasets()])
            )
          }
          avatar={folderDetail.avatar}
          name={folderDetail.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: folderDetail.permission,
            onGetCollaboratorList: () => getCollaboratorList(folderDetail._id),
            roleList: DatasetRoleList,
            onUpdateCollaborators: (params) =>
              postUpdateDatasetCollaborators({ ...params, datasetId: folderDetail._id }),
            onDelOneCollaborator: async (params) =>
              deleteDatasetCollaborators({ ...params, datasetId: folderDetail._id }),
            refreshDeps: [folderDetail._id, folderDetail.inheritPermission]
          }}
          onClose={() => setFolderPerOpen(false)}
        />
      )}
    </MyBox>
  );
};
export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dataset', 'user', 'app', 'common']))
    }
  };
}

function DatasetContextWrapper() {
  const { isPc } = useSystem();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  return (
    <>
      {isPc && <DashboardNavbar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />}
      <Box
        h={'100%'}
        pl={isPc ? sidebarWidth : 0}
        position={'relative'}
        bgGradient="linear(180deg, #F2F8FF 0%, #F7F9FC 12%)"
        transition="padding-left 0.2s ease"
      >
        <BgDecoration />
        <DatasetContextProvider>
          <Dataset />
        </DatasetContextProvider>
      </Box>
    </>
  );
}

export default DatasetContextWrapper;
