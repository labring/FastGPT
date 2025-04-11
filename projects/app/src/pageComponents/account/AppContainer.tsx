import { Box, Flex, Input, InputGroup, useDisclosure } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import Sidebar, { GroupType } from '@/pageComponents/app/list/Sidebar';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from '../app/list/context';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { AppGroupEnum, AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';

const AppContainer = ({
  children,
  rightContent,
  renderFolderDetail
}: {
  children: React.ReactNode;
  rightContent?: React.ReactNode;
  renderFolderDetail?: React.ReactNode;
}) => {
  const { isPc } = useSystem();
  const { isOpen: isOpenSidebar, onOpen: onOpenSidebar, onClose: onCloseSidebar } = useDisclosure();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();

  const selectedGroup = useMemo(() => {
    return router.pathname.split('/').pop() as AppGroupEnum;
  }, [router.pathname]);

  const {
    paths,
    folderDetail,
    sidebarWidth,
    setSidebarWidth,
    pluginGroups,
    plugins,
    templateTags,
    templateList,
    searchKey,
    setSearchKey,
    isLoading: isLoadingAppList
  } = useContextSelector(AppListContext, (v) => v);

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
        groupId: AppGroupEnum.teamApps,
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
      [AppGroupEnum.teamApps]: [
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
      [AppGroupEnum.templateMarket]: [
        ...filterTemplateTags.map((tag) => ({
          typeId: tag.typeId,
          typeName: t(tag.typeName as any)
        })),
        ...(feConfigs?.appTemplateCourse
          ? [
              {
                typeId: AppTemplateTypeEnum.contribute,
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
  }, [t, filterTemplateTags, feConfigs?.appTemplateCourse, pluginGroups, plugins]);

  const currentGroup = useMemo(() => {
    return groupList.find((group) => group.groupId === selectedGroup);
  }, [selectedGroup, groupList]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      {(isPc || isOpenSidebar) && (
        <Sidebar
          groupList={groupList}
          groupItems={groupItems}
          onCloseSidebar={onCloseSidebar}
          setSidebarWidth={setSidebarWidth}
          isLoading={isLoadingAppList}
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

            {rightContent}
          </Flex>

          {!isPc && <Box mt={2}>{RenderSearchInput}</Box>}

          <MyBox flex={'1 0 0'} isLoading={isLoadingAppList}>
            {children}
          </MyBox>
        </Flex>
        {isPc && renderFolderDetail}
      </Flex>
    </Flex>
  );
};

export default AppContainer;
