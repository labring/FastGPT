'use client';
import React, { useMemo, useState } from 'react';
import { Box, Flex, Button, useDisclosure } from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postCreateAppFolder } from '@/web/core/app/api/app';
import type { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import { useContextSelector } from 'use-context-selector';
import AppListContextProvider, { AppListContext } from '@/pageComponents/dashboard/apps/context';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import FolderSlideCard from '@/components/common/folder/SlideCard';
import { delAppById, resumeInheritPer } from '@/web/core/app/api';
import { AppRoleList } from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import JsonImportModal from '@/pageComponents/dashboard/apps/JsonImportModal';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import List from '@/pageComponents/dashboard/apps/List';
import { getUtmWorkflow } from '@/web/support/marketing/utils';
import { useMount } from 'ahooks';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';

const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);

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
    setSearchKey,
    searchKey
  } = useContextSelector(AppListContext, (v) => v);
  const { userInfo } = useUserStore();
  const [editFolder, setEditFolder] = useState<EditFolderFormType>();

  const {
    isOpen: isOpenCreateHttpTools,
    onOpen: onOpenCreateHttpTools,
    onClose: onCloseCreateHttpTools
  } = useDisclosure();
  const {
    isOpen: isOpenCreateMCPTools,
    onOpen: onOpenCreateMCPTools,
    onClose: onCloseCreateMCPTools
  } = useDisclosure();
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
    onSuccess(data) {
      data.forEach((appId) => {
        localStorage.removeItem(`app_log_keys_${appId}`);
      });

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
      [AppTypeEnum.agent]: 'AI Agent',
      [AppTypeEnum.workflow]: t('app:type.Workflow bot'),
      [AppTypeEnum.plugin]: t('app:type.Plugin'),
      [AppTypeEnum.httpToolSet]: t('app:type.Http tool set'),
      [AppTypeEnum.folder]: t('common:Folder'),
      [AppTypeEnum.toolSet]: t('app:type.MCP tools'),
      [AppTypeEnum.tool]: t('app:type.MCP tools'),
      [AppTypeEnum.hidden]: t('app:type.hidden'),
      [AppTypeEnum.simple]: t('app:type.Simple bot'),

      // deprecated
      [AppTypeEnum.httpPlugin]: t('app:type.Http plugin')
    };
    return map[appType] || map['all'];
  }, [appType, t]);

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

            {isPc && (
              <SearchInput
                maxW={['auto', '250px']}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                placeholder={t('app:search_app')}
                maxLength={30}
              />
            )}

            {(folderDetail
              ? folderDetail.permission.hasWritePer && folderDetail?.type !== AppTypeEnum.httpPlugin
              : userInfo?.team.permission.hasAppCreatePer) && (
              <>
                <Button
                  variant={'grayBase'}
                  leftIcon={<MyIcon name={'common/addLight'} w={'18px'} mr={-1} />}
                  onClick={() => setEditFolder({})}
                >
                  {t('common:Folder')}
                </Button>
                <Button
                  variant={'grayBase'}
                  leftIcon={<MyIcon name={'common/importLight'} w={'14px'} />}
                  onClick={onOpenJsonImportModal}
                >
                  {t('common:Import')}
                </Button>
                <Button
                  leftIcon={<MyIcon name={'common/addLight'} w={'18px'} mr={-1} />}
                  onClick={() =>
                    router.push({
                      pathname: '/dashboard/apps/create',
                      query: { parentId }
                    })
                  }
                >
                  <Box>{t('common:App')}</Box>
                </Button>
              </>
            )}
          </Flex>

          {!isPc && (
            <Box mt={2}>
              {
                <SearchInput
                  maxW={['auto', '250px']}
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder={t('app:search_app')}
                  maxLength={30}
                />
              }
            </Box>
          )}

          <MyBox flex={'1 0 0'} isLoading={myApps.length === 0 && isFetchingApps}>
            <List />
          </MyBox>
        </Flex>

        {/* Folder slider */}
        {!!folderDetail && isPc && (
          <Box pt={[4, 6]} pr={[4, 6]} h={'100%'} pb={4} overflow={'auto'}>
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
                roleList: AppRoleList,
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
