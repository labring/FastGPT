import FolderSlideCard from '@/components/common/folder/SlideCard';
import AppContainer from '@/pageComponents/account/AppContainer';
import AppListContextProvider, { AppListContext } from '@/pageComponents/app/list/context';
import { CreateAppType } from '@/pageComponents/app/list/CreateModal';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { delAppById, resumeInheritPer } from '@/web/core/app/api';
import { postCreateAppFolder } from '@/web/core/app/api/app';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import { useUserStore } from '@/web/support/user/useUserStore';
import { AddIcon } from '@chakra-ui/icons';
import { Box, Button, useDisclosure } from '@chakra-ui/react';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppPermissionList } from '@fastgpt/global/support/permission/app/constant';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';

const List = dynamic(() => import('@/pageComponents/app/list/List'));
const CreateModal = dynamic(() => import('@/pageComponents/app/list/CreateModal'));
const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);
const HttpEditModal = dynamic(() => import('@/pageComponents/app/list/HttpPluginEditModal'));
const JsonImportModal = dynamic(() => import('@/pageComponents/app/list/JsonImportModal'));
const TeamApps = () => {
  const { folderDetail } = useContextSelector(AppListContext, (v) => v);
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const [createAppType, setCreateAppType] = useState<CreateAppType>();
  const [editFolder, setEditFolder] = useState<EditFolderFormType>();
  const router = useRouter();

  const { loadMyApps, parentId, onUpdateApp, refetchFolderDetail, setMoveAppId } =
    useContextSelector(AppListContext, (v) => v);

  const {
    isOpen: isOpenCreateHttpPlugin,
    onOpen: onOpenCreateHttpPlugin,
    onClose: onCloseCreateHttpPlugin
  } = useDisclosure();
  const {
    isOpen: isOpenJsonImportModal,
    onOpen: onOpenJsonImportModal,
    onClose: onCloseJsonImportModal
  } = useDisclosure();

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
    <AppContainer
      rightContent={
        (folderDetail
          ? folderDetail.permission.hasWritePer && folderDetail?.type !== AppTypeEnum.httpPlugin
          : userInfo?.team.permission.hasWritePer) && (
          <MyMenu
            size="md"
            Button={
              <Button variant={'primary'} leftIcon={<AddIcon />}>
                <Box>{t('common:new_create')}</Box>
              </Button>
            }
            menuList={[
              {
                children: [
                  {
                    icon: 'core/app/simpleBot',
                    label: t('app:type.Simple bot'),
                    description: t('app:type.Create simple bot tip'),
                    onClick: () => setCreateAppType(AppTypeEnum.simple)
                  },
                  {
                    icon: 'core/app/type/workflowFill',
                    label: t('app:type.Workflow bot'),
                    description: t('app:type.Create workflow tip'),
                    onClick: () => setCreateAppType(AppTypeEnum.workflow)
                  },
                  {
                    icon: 'core/app/type/pluginFill',
                    label: t('app:type.Plugin'),
                    description: t('app:type.Create one plugin tip'),
                    onClick: () => setCreateAppType(AppTypeEnum.plugin)
                  },
                  {
                    icon: 'core/app/type/httpPluginFill',
                    label: t('app:type.Http plugin'),
                    description: t('app:type.Create http plugin tip'),
                    onClick: onOpenCreateHttpPlugin
                  }
                ]
              },
              {
                children: [
                  {
                    icon: 'core/app/type/jsonImport',
                    label: t('app:type.Import from json'),
                    description: t('app:type.Import from json tip'),
                    onClick: onOpenJsonImportModal
                  }
                ]
              },
              {
                children: [
                  {
                    icon: FolderIcon,
                    label: t('common:Folder'),
                    onClick: () => setEditFolder({})
                  }
                ]
              }
            ]}
          />
        )
      }
      renderFolderDetail={
        folderDetail && (
          <Box pt={[4, 6]} pr={[4, 6]}>
            <FolderSlideCard
              refetchResource={() => Promise.all([refetchFolderDetail(), loadMyApps()])}
              resumeInheritPermission={() => resumeInheritPer(folderDetail._id)}
              isInheritPermission={folderDetail.inheritPermission}
              hasParent={!!folderDetail.parentId}
              refreshDeps={[folderDetail._id, folderDetail.inheritPermission]}
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
              deleteTip={t('app:confirm_delete_folder_tip')}
              onDelete={() => onDeleFolder(folderDetail._id)}
              managePer={{
                permission: folderDetail.permission,
                onGetCollaboratorList: () => getCollaboratorList(folderDetail._id),
                permissionList: AppPermissionList,
                onUpdateCollaborators: ({
                  members,
                  groups,
                  permission
                }: {
                  members?: string[];
                  groups?: string[];
                  permission: PermissionValueType;
                }) => {
                  return postUpdateAppCollaborators({
                    members,
                    groups,
                    permission,
                    appId: folderDetail._id
                  });
                },
                refreshDeps: [folderDetail._id, folderDetail.inheritPermission],
                onDelOneCollaborator: async ({
                  tmbId,
                  groupId,
                  orgId
                }: {
                  tmbId?: string;
                  groupId?: string;
                  orgId?: string;
                }) => {
                  if (tmbId) {
                    return deleteAppCollaborators({
                      appId: folderDetail._id,
                      tmbId
                    });
                  } else if (groupId) {
                    return deleteAppCollaborators({
                      appId: folderDetail._id,
                      groupId
                    });
                  } else if (orgId) {
                    return deleteAppCollaborators({
                      appId: folderDetail._id,
                      orgId
                    });
                  }
                }
              }}
            />
          </Box>
        )
      }
    >
      <List />

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
      {isOpenJsonImportModal && <JsonImportModal onClose={onCloseJsonImportModal} />}
    </AppContainer>
  );
};

function ContextRender() {
  return (
    <AppListContextProvider>
      <TeamApps />
    </AppListContextProvider>
  );
}

export default ContextRender;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'user']))
    }
  };
}
