'use client';
import React, { useState } from 'react';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postCreateAppFolder } from '@/web/core/app/api/app';
import type { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import { useContextSelector } from 'use-context-selector';
import AppListContextProvider, { AppListContext } from '@/pageComponents/dashboard/agent/context';
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
import JsonImportModal from '@/pageComponents/dashboard/agent/JsonImportModal';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import List from '@/pageComponents/dashboard/agent/List';
import { getUtmWorkflow } from '@/web/support/marketing/utils';
import { useMount } from 'ahooks';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import TemplateCreatePanel from '@/pageComponents/dashboard/agent/TemplateCreatePanel';

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
    searchKey,
    setSearchKey
  } = useContextSelector(AppListContext, (v) => v);
  const [editFolder, setEditFolder] = useState<EditFolderFormType>();
  const { userInfo } = useUserStore();

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

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex gap={5} flex={'1 0 0'} h={0}>
        <Flex
          flex={'1 0 0'}
          flexDirection={'column'}
          h={'100%'}
          pr={folderDetail ? [3, 2] : [3, 6]}
          pl={6}
          pt={6}
          overflowY={'auto'}
          overflowX={'hidden'}
        >
          {/* Only shown on pc root page */}
          {!folderDetail && isPc && <TemplateCreatePanel type={appType} />}
          <Flex alignItems={'center'}>
            {!isPc ? (
              MenuIcon
            ) : paths.length > 0 ? (
              <Box>
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
            ) : (
              <Box color={'myGray.900'} fontSize={'20px'} fontWeight={'medium'}>
                Agent
              </Box>
            )}
            <Flex flex={1} />
            <Flex alignItems={'center'} gap={3}>
              {isPc && (
                <SearchInput
                  maxW={['auto', '250px']}
                  value={searchKey}
                  bg={'white'}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder={t('app:search_agent')}
                  maxLength={30}
                />
              )}

              {(folderDetail
                ? folderDetail.permission.hasWritePer &&
                  folderDetail?.type !== AppTypeEnum.httpPlugin
                : userInfo?.team.permission.hasAppCreatePer) && (
                <>
                  <Button
                    variant={'grayBase'}
                    leftIcon={<MyIcon name={'common/addLight'} w={'18px'} mr={-1} />}
                    onClick={() => setEditFolder({})}
                    px={5}
                  >
                    {t('common:Folder')}
                  </Button>
                  <Button
                    variant={'grayBase'}
                    leftIcon={<MyIcon name={'common/importLight'} w={'14px'} />}
                    onClick={onOpenJsonImportModal}
                    px={5}
                  >
                    {t('common:Import')}
                  </Button>
                </>
              )}
            </Flex>
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
                defaultRole: ReadRoleVal,
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
          onCreate={(data) => onCreateFolder({ ...data, parentId, type: AppTypeEnum.folder })}
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
