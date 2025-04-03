import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
import AppListContextProvider, { AppListContext } from '@/pageComponents/app/list/context';
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
import type { CreateAppType } from '@/pageComponents/app/list/CreateModal';
import { AppGroupEnum, AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyIcon from '@fastgpt/web/components/common/Icon';
import JsonImportModal from '@/pageComponents/app/list/JsonImportModal';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getTemplateMarketItemList, getTemplateTagList } from '@/web/core/app/api/template';
import { TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getPluginGroups, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import TemplateList, { TemplateAppType } from '@/pageComponents/app/list/TemplateList';
import PluginList from '@/pageComponents/app/list/PluginList';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Sidebar, { GroupType } from '@/pageComponents/app/list/Sidebar';
import MySelect from '@fastgpt/web/components/common/MySelect';

const CreateModal = dynamic(() => import('@/pageComponents/app/list/CreateModal'));
const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);
const HttpEditModal = dynamic(() => import('@/pageComponents/app/list/HttpPluginEditModal'));
const List = dynamic(() => import('@/pageComponents/app/list/List'));

const recommendTag: TemplateTypeSchemaType = {
  typeId: AppTemplateTypeEnum.recommendation,
  typeName: i18nT('app:templateMarket.templateTags.Recommendation'),
  typeOrder: 0
};

const MyApps = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const {
    paths,
    parentId,
    myApps,
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
  const { feConfigs } = useSystemStore();
  const { group: selectedGroup = AppGroupEnum.teamApp, type: selectedType = 'all' } = router.query;

  const [currentAppType, setCurrentAppType] = useState<TemplateAppType>('all');
  const [createAppType, setCreateAppType] = useState<CreateAppType>();
  const [sidebarWidth, setSidebarWidth] = useState(300);
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
  const { isOpen: isOpenSidebar, onOpen: onOpenSidebar, onClose: onCloseSidebar } = useDisclosure();

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

  const { data: pluginGroups = [], loading: isLoadingPluginGroups } = useRequest2(getPluginGroups, {
    manual: false
  });
  const { data: plugins = [], loading: isLoadingPlugins } = useRequest2(getSystemPlugTemplates, {
    manual: selectedGroup === AppGroupEnum.templateMarket || selectedGroup === AppGroupEnum.teamApp,
    refreshDeps: [selectedGroup]
  });
  const { data: templateTags = [], loading: isLoadingTags } = useRequest2(
    () => getTemplateTagList().then((res) => [recommendTag, ...res]),
    {
      manual: selectedGroup !== AppGroupEnum.templateMarket,
      refreshDeps: [selectedGroup]
    }
  );
  const { data: templateList = [], loading: isLoadingTemplates } = useRequest2(
    () => getTemplateMarketItemList({ type: currentAppType }),
    {
      manual: selectedGroup !== AppGroupEnum.templateMarket,
      refreshDeps: [currentAppType, selectedGroup]
    }
  );
  const filterTemplateTags = useMemo(() => {
    return templateTags
      .map((tag) => {
        const templates = templateList.filter((template) => template.tags.includes(tag.typeId));
        return {
          ...tag,
          templates
        };
      })
      .filter((item) => item.templates.length > 0);
  }, [templateList, templateTags]);

  const groupList = useMemo(() => {
    return [
      {
        groupId: AppGroupEnum.teamApp,
        groupAvatar: 'common/app',
        groupName: t('common:core.module.template.Team app')
      },
      ...pluginGroups.map((group) => ({
        groupId: group.groupId,
        groupAvatar: group.groupAvatar,
        groupName: t(group.groupName as any)
      })),
      {
        groupId: AppGroupEnum.templateMarket,
        groupAvatar: 'common/templateMarket',
        groupName: t('app:template_market')
      }
    ];
  }, [t, pluginGroups]);
  const groupItems: Record<GroupType, { typeId: string; typeName: string }[]> = useMemo(() => {
    const baseItems = {
      teamApp: [
        {
          typeId: 'all',
          typeName: t('app:type.All')
        },
        {
          typeId: AppTypeEnum.simple,
          typeName: t('app:type.Simple bot')
        },
        {
          typeId: AppTypeEnum.workflow,
          typeName: t('app:type.Workflow bot')
        },
        {
          typeId: AppTypeEnum.plugin,
          typeName: t('app:type.Plugin')
        }
      ],
      templateMarket: [
        ...filterTemplateTags.map((tag) => ({
          typeId: tag.typeId,
          typeName: t(tag.typeName as any)
        })),
        ...(feConfigs?.appTemplateCourse
          ? [
              {
                typeId: 'contribute',
                typeName: t('common:contribute_app_template')
              }
            ]
          : [])
      ]
    };
    const pluginGroupItems = pluginGroups.reduce(
      (acc, group) => {
        acc[group.groupId] = [
          {
            typeId: 'all',
            typeName: t('app:type.All')
          },
          ...group.groupTypes
            .filter((type) => plugins.find((plugin) => plugin.templateType === type.typeId))
            .map((type) => ({
              typeId: type.typeId,
              typeName: t(type.typeName as any)
            }))
        ];
        return acc;
      },
      {} as Record<string, { typeId: string; typeName: string }[]>
    );

    return {
      ...baseItems,
      ...pluginGroupItems
    };
  }, [t, templateTags, pluginGroups]);

  const currentGroup = useMemo(() => {
    return groupList.find((group) => group.groupId === selectedGroup);
  }, [selectedGroup, groupList]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      {(isPc || isOpenSidebar) && (
        <Sidebar
          groupList={groupList}
          groupItems={groupItems}
          selectedGroup={selectedGroup as GroupType}
          selectedType={selectedType as string}
          onCloseSidebar={onCloseSidebar}
          setSidebarWidth={setSidebarWidth}
          isLoading={isLoadingPluginGroups || isLoadingTags}
        />
      )}

      {paths.length > 0 && (
        <Box pt={[4, 6]} pl={6} ml={[0, isPc ? `${sidebarWidth}px` : 0]}>
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
      <Flex gap={5} flex={'1 0 0'} h={0} ml={[0, isPc ? `${sidebarWidth}px` : 0]}>
        <Flex
          flex={'1 0 0'}
          flexDirection={'column'}
          h={'100%'}
          pr={folderDetail ? [3, 2] : [3, 8]}
          pl={6}
          overflowY={'auto'}
          overflowX={'hidden'}
        >
          <Flex pt={paths.length > 0 ? 3 : [4, 6]} alignItems={'center'} gap={3}>
            <Box fontSize={'20px'} fontWeight={'medium'} color={'myGray.900'}>
              {isPc ? (
                currentGroup?.groupName
              ) : (
                <MyIcon name="menu" w={'20px'} mr={1.5} onClick={onOpenSidebar} />
              )}
            </Box>

            <Box flex={1} />

            {isPc && RenderSearchInput}

            {selectedGroup === AppGroupEnum.teamApp &&
              (folderDetail
                ? folderDetail.permission.hasWritePer &&
                  folderDetail?.type !== AppTypeEnum.httpPlugin
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
              )}

            {selectedGroup === AppGroupEnum.templateMarket && (
              <MySelect<TemplateAppType>
                h={'8'}
                value={currentAppType}
                onChange={(value) => {
                  setCurrentAppType(value);
                }}
                minW={'7rem'}
                borderRadius={'sm'}
                list={[
                  { label: t('app:type.All'), value: 'all' },
                  { label: t('app:type.Simple bot'), value: AppTypeEnum.simple },
                  { label: t('app:type.Workflow bot'), value: AppTypeEnum.workflow },
                  { label: t('app:type.Plugin'), value: AppTypeEnum.plugin }
                ]}
              />
            )}
          </Flex>
          {!isPc && <Box mt={2}>{RenderSearchInput}</Box>}

          <MyBox flex={'1 0 0'} isLoading={myApps.length === 0 && isFetchingApps}>
            {selectedGroup === AppGroupEnum.teamApp && <List />}
            {selectedGroup === AppGroupEnum.templateMarket && (
              <TemplateList
                templateTags={filterTemplateTags}
                templateList={templateList}
                searchKey={searchKey}
              />
            )}
            {selectedGroup !== AppGroupEnum.teamApp &&
              selectedGroup !== AppGroupEnum.templateMarket && (
                <PluginList
                  plugins={plugins}
                  pluginGroups={pluginGroups}
                  selectedGroup={selectedGroup as string}
                  selectedType={selectedType as string}
                  searchKey={searchKey}
                />
              )}
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
      {isOpenJsonImportModal && <JsonImportModal onClose={onCloseJsonImportModal} />}
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
