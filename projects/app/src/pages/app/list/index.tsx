import React, { useMemo, useState } from 'react';
import { Box, Flex, Button, useDisclosure, Input, InputGroup } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useI18n } from '@/web/context/I18n';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
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
import { delAppById, resumeInheritPer } from '@/web/core/app/api';
import { AppPermissionList } from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import type { CreateAppType } from './components/CreateModal';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyIcon from '@fastgpt/web/components/common/Icon';
import TemplateMarketModal from './components/TemplateMarketModal';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';

const CreateModal = dynamic(() => import('./components/CreateModal'));
const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);
const HttpEditModal = dynamic(() => import('./components/HttpPluginEditModal'));
const List = dynamic(() => import('./components/List'));

const MyApps = () => {
  const { t } = useTranslation();
  const { appT } = useI18n();
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
  const [editFolder, setEditFolder] = useState<EditFolderFormType>();
  const [templateModalType, setTemplateModalType] = useState<AppTypeEnum | 'all'>();

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
          placeholder={appT('search_app')}
          maxLength={30}
          pl={8}
          bg={'white'}
        />
      </InputGroup>
    ),
    [searchKey, setSearchKey, appT]
  );

  return (
    <Flex flexDirection={'column'} h={'100%'}>
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
        <Flex
          flex={'1 0 0'}
          flexDirection={'column'}
          h={'100%'}
          pr={folderDetail ? [3, 2] : [3, 8]}
          pl={3}
          overflowY={'auto'}
          overflowX={'hidden'}
        >
          <Flex pt={paths.length > 0 ? 3 : [4, 6]} alignItems={'center'} gap={3}>
            <LightRowTabs
              list={[
                {
                  label: t('app:type.All'),
                  value: 'ALL'
                },
                {
                  label: t('app:type.Simple bot'),
                  value: AppTypeEnum.simple
                },
                {
                  label: t('app:type.Workflow bot'),
                  value: AppTypeEnum.workflow
                },
                {
                  label: t('app:type.Plugin'),
                  value: AppTypeEnum.plugin
                }
              ]}
              value={appType}
              inlineStyles={{ px: 0.5 }}
              gap={5}
              display={'flex'}
              alignItems={'center'}
              fontSize={['sm', 'md']}
              flexShrink={0}
              onChange={(e) => {
                router.push({
                  query: {
                    ...router.query,
                    type: e
                  }
                });
              }}
            />
            <Box flex={1} />

            {isPc && RenderSearchInput}

            {isPc && (
              <Flex
                alignItems={'center'}
                gap={1.5}
                border={'1px solid'}
                borderColor={'myGray.250'}
                h={9}
                px={4}
                fontSize={'14px'}
                fontWeight={'medium'}
                bg={'white'}
                rounded={'sm'}
                cursor={'pointer'}
                boxShadow={
                  '0px 1px 2px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                }
                _hover={{
                  bg: 'primary.50',
                  color: 'primary.600'
                }}
                onClick={() => setTemplateModalType('all')}
              >
                <MyImage src={'/imgs/app/templateFill.svg'} w={'18px'} />
                {t('app:template_market')}
              </Flex>
            )}

            {(folderDetail
              ? folderDetail.permission.hasWritePer && folderDetail?.type !== AppTypeEnum.httpPlugin
              : userInfo?.team.permission.hasWritePer) && (
              <MyMenu
                size="md"
                Button={
                  <Button variant={'primary'} leftIcon={<AddIcon />}>
                    <Box>{t('common:common.Create New')}</Box>
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
                  ...(isPc
                    ? []
                    : [
                        {
                          children: [
                            {
                              icon: '/imgs/app/templateFill.svg',
                              label: t('app:template_market'),
                              description: t('app:template_market_description'),
                              onClick: () => setTemplateModalType('all')
                            }
                          ]
                        }
                      ]),
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
              deleteTip={appT('confirm_delete_folder_tip')}
              onDelete={() => onDeleFolder(folderDetail._id)}
              managePer={{
                mode: 'all',
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
                  permission: number;
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
                  groupId
                }: {
                  tmbId?: string;
                  groupId?: string;
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
                  }
                }
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
        <CreateModal
          type={createAppType}
          onClose={() => setCreateAppType(undefined)}
          onOpenTemplateModal={setTemplateModalType}
        />
      )}
      {isOpenCreateHttpPlugin && <HttpEditModal onClose={onCloseCreateHttpPlugin} />}
      {!!templateModalType && (
        <TemplateMarketModal
          onClose={() => setTemplateModalType(undefined)}
          defaultType={templateModalType}
        />
      )}
    </Flex>
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
      ...(await serviceSideProps(content, ['app', 'user']))
    }
  };
}
