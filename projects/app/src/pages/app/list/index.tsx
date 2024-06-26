import React, { useCallback, useState } from 'react';
import { Box, Flex, Button, useDisclosure } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useI18n } from '@/web/context/I18n';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';

import List from './components/List';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postCreateAppFolder } from '@/web/core/app/api/app';
import type { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import { useContextSelector } from 'use-context-selector';
import AppListContextProvider, { AppListContext } from './components/context';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import FolderSlideCard from '@/components/common/folder/SlideCard';
import { delAppById } from '@/web/core/app/api';
import {
  AppDefaultPermissionVal,
  AppPermissionList
} from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { CreateAppType } from './components/CreateModal';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';

const CreateModal = dynamic(() => import('./components/CreateModal'));
const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);
const HttpEditModal = dynamic(() => import('./components/HttpPluginEditModal'));

const MyApps = () => {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const router = useRouter();
  const { isPc } = useSystemStore();
  const {
    paths,
    parentId,
    myApps,
    appType,
    loadMyApps,
    onUpdateApp,
    setMoveAppId,
    isFetchingApps,
    folderDetail
  } = useContextSelector(AppListContext, (v) => v);
  const { userInfo } = useUserStore();

  const [createAppType, setCreateAppType] = useState<CreateAppType>();
  const {
    isOpen: isOpenCreateHttpPlugin,
    onOpen: onOpenCreateHttpPlugin,
    onClose: onCloseCreateHttpPlugin
  } = useDisclosure();
  const [editFolder, setEditFolder] = useState<EditFolderFormType>();

  const { runAsync: onCreateFolder } = useRequest2(postCreateAppFolder, {
    onSuccess() {
      loadMyApps();
    },
    errorToast: 'Error'
  });
  const { runAsync: onDeleFolder } = useRequest2(delAppById, {
    onSuccess() {
      router.replace({
        query: {
          parentId: folderDetail?.parentId
        }
      });
    },
    errorToast: 'Error'
  });

  return (
    <MyBox
      display={'flex'}
      flexDirection={'column'}
      isLoading={myApps.length === 0 && isFetchingApps}
      h={'100%'}
    >
      {paths.length > 0 && (
        <Box pt={[4, 6]} pl={3}>
          <FolderPath
            paths={paths}
            hoverStyle={{ bg: 'myGray.200' }}
            onClick={(parentId) => {
              router.push({
                query: {
                  ...router.query,
                  parentId
                }
              });
            }}
          />
        </Box>
      )}
      <Flex gap={5} flex={'1 0 0'} h={0}>
        <Box
          flex={'1 0 0'}
          h={'100%'}
          pr={folderDetail ? [4, 6] : [4, 10]}
          pl={3}
          overflowY={'auto'}
          overflowX={'hidden'}
        >
          <Flex
            pt={paths.length > 0 ? 4 : [4, 6]}
            alignItems={'center'}
            justifyContent={'space-between'}
          >
            <LightRowTabs
              list={[
                {
                  label: appT('type.All'),
                  value: 'ALL'
                },
                {
                  label: appT('type.Simple bot'),
                  value: AppTypeEnum.simple
                },
                {
                  label: appT('type.Workflow bot'),
                  value: AppTypeEnum.workflow
                },
                {
                  label: appT('type.Plugin'),
                  value: AppTypeEnum.plugin
                }
              ]}
              value={appType}
              inlineStyles={{ px: 0.5 }}
              gap={5}
              display={'flex'}
              alignItems={'center'}
              fontSize={['sm', 'md']}
              onChange={(e) => {
                router.push({
                  query: {
                    ...router.query,
                    type: e
                  }
                });
              }}
            />

            {userInfo?.team.permission.hasWritePer &&
              folderDetail?.type !== AppTypeEnum.httpPlugin && (
                <MyMenu
                  iconSize="1.5rem"
                  Button={
                    <Button variant={'primary'} leftIcon={<AddIcon />}>
                      <Box>{t('common.Create New')}</Box>
                    </Button>
                  }
                  menuList={[
                    {
                      children: [
                        {
                          icon: 'core/app/simpleBot',
                          label: appT('type.Simple bot'),
                          description: appT('type.Create simple bot tip'),
                          onClick: () => setCreateAppType(AppTypeEnum.simple)
                        },
                        {
                          icon: 'core/app/type/workflowFill',
                          label: appT('type.Workflow bot'),
                          description: appT('type.Create workflow tip'),
                          onClick: () => setCreateAppType(AppTypeEnum.workflow)
                        },
                        {
                          icon: 'core/app/type/pluginFill',
                          label: appT('type.Plugin'),
                          description: appT('type.Create one plugin tip'),
                          onClick: () => setCreateAppType(AppTypeEnum.plugin)
                        },
                        {
                          icon: 'core/app/type/httpPluginFill',
                          label: appT('type.Http plugin'),
                          description: appT('type.Create http plugin tip'),
                          onClick: onOpenCreateHttpPlugin
                        }
                      ]
                    },
                    {
                      children: [
                        {
                          icon: FolderIcon,
                          label: t('Folder'),
                          onClick: () => setEditFolder({})
                        }
                      ]
                    }
                  ]}
                />
              )}
          </Flex>

          <List />
        </Box>
        {!!folderDetail && isPc && (
          <Box pt={[4, 6]} pr={[4, 6]}>
            <FolderSlideCard
              refreshDeps={[folderDetail._id]}
              name={folderDetail.name}
              intro={folderDetail.intro}
              onEdit={() => {
                setEditFolder({
                  id: folderDetail._id,
                  name: folderDetail.name,
                  intro: folderDetail.intro
                });
              }}
              onMove={() => setMoveAppId(folderDetail._id)}
              deleteTip={appT('Confirm delete folder tip')}
              onDelete={() => onDeleFolder(folderDetail._id)}
              defaultPer={{
                value: folderDetail.defaultPermission,
                defaultValue: AppDefaultPermissionVal,
                onChange: (e) => {
                  return onUpdateApp(folderDetail._id, { defaultPermission: e });
                }
              }}
              managePer={{
                permission: folderDetail.permission,
                onGetCollaboratorList: () => getCollaboratorList(folderDetail._id),
                permissionList: AppPermissionList,
                onUpdateCollaborators: ({
                  tmbIds,
                  permission
                }: {
                  tmbIds: string[];
                  permission: number;
                }) => {
                  return postUpdateAppCollaborators({
                    tmbIds,
                    permission,
                    appId: folderDetail._id
                  });
                },
                onDelOneCollaborator: (tmbId: string) =>
                  deleteAppCollaborators({
                    appId: folderDetail._id,
                    tmbId
                  })
              }}
            />
          </Box>
        )}
      </Flex>

      {!!editFolder && (
        <EditFolderModal
          {...editFolder}
          onClose={() => setEditFolder(undefined)}
          onCreate={(data) => onCreateFolder({ ...data, parentId })}
          onEdit={({ id, ...data }) => onUpdateApp(id, data)}
        />
      )}
      {!!createAppType && (
        <CreateModal type={createAppType} onClose={() => setCreateAppType(undefined)} />
      )}
      {isOpenCreateHttpPlugin && <HttpEditModal onClose={onCloseCreateHttpPlugin} />}
    </MyBox>
  );
};

function ContextRender() {
  return (
    <AppListContextProvider>
      <MyApps />
    </AppListContextProvider>
  );
}

export default ContextRender;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app']))
    }
  };
}
