'use client';
import React, { useState } from 'react';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postCreateAppFolder } from '@/web/core/app/api/app';
import type { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import { useContextSelector } from 'use-context-selector';
import AppListContextProvider, { AppListContext } from '@/pageComponents/dashboard/agent/context';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import FolderSlideCard from '@/components/common/folder/SlideCard';
import { delAppById, resumeInheritPer } from '@/web/core/app/api';
import { AppRoleList } from '@fastgpt/global/support/permission/app/constant';
import { getCollaboratorList, postUpdateAppCollaborators } from '@/web/core/app/api/collaborator';
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
import AppListFilters from '@/pageComponents/dashboard/agent/filters/AppListFilters';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  canCreateSubFolder,
  DEFAULT_MAX_FOLDER_DEPTH
} from '@fastgpt/global/common/parentFolder/depth';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);

const MyTools = ({ MenuIcon }: { MenuIcon: JSX.Element }) => {
  const { t } = useSafeTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const {
    paths,
    parentId,
    loadMyApps,
    onUpdateApp,
    setMoveAppId,
    folderDetail,
    refetchFolderDetail,
    searchKey,
    setSearchKey,
    listFilters,
    setListFilters,
    isBatchMode,
    setIsBatchMode
  } = useContextSelector(AppListContext, (v) => v);
  const [editFolder, setEditFolder] = useState<EditFolderFormType>();
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const maxFolderDepth = feConfigs?.limit?.maxFolderDepth ?? DEFAULT_MAX_FOLDER_DEPTH;
  const canCreateFolder = canCreateSubFolder(parentId, paths, maxFolderDepth);
  const folderDepthLimitTip = t('common:folder_depth_limit_tip');
  const hasCreatePer = folderDetail
    ? folderDetail.permission.hasWritePer && folderDetail?.type !== AppTypeEnum.httpPlugin
    : Boolean(userInfo?.team.permission.hasAppCreatePer);

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

  const { runAsync: onCreateFolder } = useRequest(postCreateAppFolder, {
    onSuccess() {
      loadMyApps();
    },
    errorToast: 'Error'
  });
  const { runAsync: onDeleFolder } = useRequest(delAppById, {
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
          pl={[3, 6]}
          pt={6}
          overflowY={'hidden'}
          overflowX={'hidden'}
        >
          <Flex alignItems={'center'} gap={3} minW={0} flexWrap={'wrap'} flexShrink={0}>
            {!isPc && MenuIcon}
            {isPc && paths.length > 0 ? (
              <Box flexShrink={0}>
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
              <Box color={'myGray.900'} fontSize={'20px'} fontWeight={'medium'} flexShrink={0}>
                {t('common:navbar.Tools')}
              </Box>
            )}
            {isPc && (
              <>
                <Box flexShrink={0} maxW={'250px'}>
                  <SearchInput
                    maxW={'250px'}
                    value={searchKey}
                    bg={'white'}
                    onChange={(e) => setSearchKey(e.target.value)}
                    placeholder={t('app:search_tool')}
                    maxLength={30}
                  />
                </Box>
                <AppListFilters scene={'tool'} value={listFilters} onChange={setListFilters} />
              </>
            )}
            <Flex flex={1} />
            {(isPc || hasCreatePer) && (
              <Flex alignItems={'center'} gap={[2, '12px']}>
                {isPc && (
                  <Button
                    variant={'grayBase'}
                    px={'14px'}
                    iconSpacing={'6px'}
                    {...(isBatchMode && {
                      color: 'primary.600',
                      bg: 'primary.50',
                      _hover: {
                        color: 'primary.600',
                        bg: 'primary.100'
                      }
                    })}
                    leftIcon={<MyIcon name={'common/checkSquareBroken'} w={'18px'} h={'18px'} />}
                    onClick={() => setIsBatchMode((prev) => !prev)}
                  >
                    {t('common:batch_manage')}
                  </Button>
                )}
                {hasCreatePer && (
                  <>
                    <MyTooltip label={canCreateFolder ? '' : folderDepthLimitTip}>
                      <Button
                        variant={'grayBase'}
                        px={['12px', '14px']}
                        iconSpacing={'6px'}
                        leftIcon={<MyIcon name={'common/add2'} w={'18px'} h={'18px'} />}
                        onClick={() => setEditFolder({})}
                        isDisabled={!canCreateFolder}
                      >
                        {t('common:Folder')}
                      </Button>
                    </MyTooltip>
                    <Button
                      variant={'grayBase'}
                      px={['12px', '14px']}
                      iconSpacing={'6px'}
                      leftIcon={<MyIcon name={'common/importLight'} w={'18px'} h={'18px'} />}
                      onClick={onOpenJsonImportModal}
                    >
                      {t('common:Import')}
                    </Button>
                  </>
                )}
              </Flex>
            )}
          </Flex>

          {!isPc && (
            <Flex mt={3} direction={'column'} gap={3}>
              {paths.length > 0 && (
                <Box overflowX={'auto'}>
                  <FolderPath
                    paths={paths}
                    forbidLastClick
                    onClick={(parentId) => {
                      router.push({ query: { ...router.query, parentId } });
                    }}
                  />
                </Box>
              )}
              <SearchInput
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                placeholder={t('app:search_tool')}
                maxLength={30}
              />
              <AppListFilters scene={'tool'} value={listFilters} onChange={setListFilters} />
            </Flex>
          )}

          <MyBox flex={'1 0 0'} minH={0}>
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
                refreshDeps: [folderDetail._id, folderDetail.inheritPermission]
              }}
            />
          </Box>
        )}
      </Flex>

      {!!editFolder && (
        <EditFolderModal
          {...editFolder}
          onClose={() => setEditFolder(undefined)}
          onCreate={(data) => onCreateFolder({ ...data, parentId, type: AppTypeEnum.toolFolder })}
          onEdit={({ id, ...data }) => onUpdateApp(id, data)}
        />
      )}
      {isOpenJsonImportModal && <JsonImportModal scene={'tool'} onClose={onCloseJsonImportModal} />}
    </Flex>
  );
};

function ContextRender() {
  return (
    <DashboardContainer>
      {({ MenuIcon }) => (
        <AppListContextProvider showPaginationTip={false}>
          <MyTools MenuIcon={MenuIcon} />
        </AppListContextProvider>
      )}
    </DashboardContainer>
  );
}

export default ContextRender;
