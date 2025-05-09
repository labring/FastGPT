import React, { useMemo, useState, useEffect } from 'react';
import { Box, Flex, Button, useDisclosure, Input, InputGroup } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postCreateAppFolder } from '@/web/core/app/api/app';
import type { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import { useContextSelector } from 'use-context-selector';
import AppListContextProvider, { AppListContext } from '@/pageComponents/dashboard/apps/context';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import FolderSlideCard from '@/components/common/folder/SlideCard';
import { delAppById, resumeInheritPer } from '@/web/core/app/api';
import { AppPermissionList } from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import type { CreateAppType } from '@/pageComponents/dashboard/apps/CreateModal';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyIcon from '@fastgpt/web/components/common/Icon';
import JsonImportModal from '@/pageComponents/dashboard/apps/JsonImportModal';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import List from '@/pageComponents/dashboard/apps/List';
import MCPToolsEditModal from '@/pageComponents/dashboard/apps/MCPToolsEditModal';
import { getUtmWorkflow } from '@/web/support/marketing/utils';
import { useMount } from 'ahooks';

const CreateModal = dynamic(() => import('@/pageComponents/dashboard/apps/CreateModal'));
const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);
const HttpEditModal = dynamic(() => import('@/pageComponents/dashboard/apps/HttpPluginEditModal'));

const MyApps = ({ MenuIcon }: { MenuIcon: JSX.Element }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const {
    paths,
    parentId,
    myApps,
    appType,
    loadMyApps,
    onUpdateApp,
    setMoveAppId,
    isFetchingApps,
    folderDetail,
    refetchFolderDetail,
    searchKey,
    setSearchKey
  } = useContextSelector(AppListContext, (v) => v);
  const { userInfo } = useUserStore();

  const [createAppType, setCreateAppType] = useState<CreateAppType>();
  const {
    isOpen: isOpenCreateHttpPlugin,
    onOpen: onOpenCreateHttpPlugin,
    onClose: onCloseCreateHttpPlugin
  } = useDisclosure();
  const {
    isOpen: isOpenCreateMCPTools,
    onOpen: onOpenCreateMCPTools,
    onClose: onCloseCreateMCPTools
  } = useDisclosure();

  const [editFolder, setEditFolder] = useState<EditFolderFormType>();

  const {
    isOpen: isOpenJsonImportModal,
    onOpen: onOpenJsonImportModal,
    onClose: onCloseJsonImportModal
  } = useDisclosure();
  //if there is a workflow url in the session storage, open the json import modal and import the workflow
  useMount(() => {
    if (getUtmWorkflow()) {
      onOpenJsonImportModal();
    }
  });

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

  const appTypeName = useMemo(() => {
    const map: Record<AppTypeEnum | 'all', string> = {
      all: t('common:core.module.template.Team app'),
      [AppTypeEnum.simple]: t('app:type.Simple bot'),
      [AppTypeEnum.workflow]: t('app:type.Workflow bot'),
      [AppTypeEnum.plugin]: t('app:type.Plugin'),
      [AppTypeEnum.httpPlugin]: t('app:type.Http plugin'),
      [AppTypeEnum.folder]: t('common:Folder'),
      [AppTypeEnum.toolSet]: t('app:type.MCP tools'),
      [AppTypeEnum.tool]: t('app:type.MCP tools')
    };
    return map[appType] || map['all'];
  }, [appType, t]);
  const RenderSearchInput = useMemo(
    () => (
      <InputGroup maxW={['auto', '250px']} position={'relative'}>
        <MyIcon
          position={'absolute'}
          zIndex={10}
          name={'common/searchLight'}
          w={'1rem'}
          color={'myGray.600'}
          left={2.5}
          top={'50%'}
          transform={'translateY(-50%)'}
        />
        <Input
          value={searchKey}
          onChange={(e) => setSearchKey(e.target.value)}
          placeholder={t('app:search_app')}
          maxLength={30}
          pl={8}
          bg={'white'}
        />
      </InputGroup>
    ),
    [searchKey, setSearchKey, t]
  );

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      {paths.length > 0 && (
        <Box pt={[4, 6]} pl={5}>
          <FolderPath
            paths={paths}
            hoverStyle={{ bg: 'myGray.200' }}
            forbidLastClick
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
        <Flex
          flex={'1 0 0'}
          flexDirection={'column'}
          h={'100%'}
          pr={folderDetail ? [3, 2] : [3, 6]}
          pl={6}
          overflowY={'auto'}
          overflowX={'hidden'}
        >
          <Flex pt={paths.length > 0 ? 3 : [4, 6]} alignItems={'center'} gap={3}>
            {isPc ? (
              <Box fontSize={'lg'} color={'myGray.900'} fontWeight={500}>
                {appTypeName}
              </Box>
            ) : (
              MenuIcon
            )}
            <Box flex={1} />

            {isPc && RenderSearchInput}

            {(folderDetail
              ? folderDetail.permission.hasWritePer && folderDetail?.type !== AppTypeEnum.httpPlugin
              : userInfo?.team.permission.hasAppCreatePer) && (
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
                      },
                      {
                        icon: 'core/app/type/mcpToolsFill',
                        label: t('app:type.MCP tools'),
                        description: t('app:type.Create mcp tools tip'),
                        onClick: onOpenCreateMCPTools
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
            )}
          </Flex>

          {!isPc && <Box mt={2}>{RenderSearchInput}</Box>}

          <MyBox flex={'1 0 0'} isLoading={myApps.length === 0 && isFetchingApps}>
            <List />
          </MyBox>
        </Flex>

        {/* Folder slider */}
        {!!folderDetail && isPc && (
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
                onUpdateCollaborators: (props) =>
                  postUpdateAppCollaborators({
                    ...props,
                    appId: folderDetail._id
                  }),
                refreshDeps: [folderDetail._id, folderDetail.inheritPermission],
                onDelOneCollaborator: async (params) =>
                  deleteAppCollaborators({
                    ...params,
                    appId: folderDetail._id
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
      {isOpenCreateMCPTools && <MCPToolsEditModal onClose={onCloseCreateMCPTools} />}
      {isOpenJsonImportModal && <JsonImportModal onClose={onCloseJsonImportModal} />}
    </Flex>
  );
};

function ContextRender() {
  return (
    <DashboardContainer>
      {({ MenuIcon }) => (
        <AppListContextProvider>
          <MyApps MenuIcon={MenuIcon} />
        </AppListContextProvider>
      )}
    </DashboardContainer>
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
