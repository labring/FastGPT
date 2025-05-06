import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { navbarWidth } from '@/components/Layout';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTemplateMarketItemList, getTemplateTagList } from '@/web/core/app/api/template';
import {
  type AppTemplateSchemaType,
  type TemplateTypeSchemaType
} from '@fastgpt/global/core/app/type';
import { getPluginGroups } from '@/web/core/app/api/plugin';
import { type PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';

export enum TabEnum {
  apps = 'apps',
  app_templates = 'templateMarket',
  mcp_server = 'mcpServer'
}
type TabEnumType = `${keyof typeof TabEnum}` | string;

const DashboardContainer = ({
  children
}: {
  children: (e: {
    templateTags: TemplateTypeSchemaType[];
    templateList: AppTemplateSchemaType[];
    pluginGroups: PluginGroupSchemaType[];
    MenuIcon: JSX.Element;
  }) => React.ReactNode;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();

  const { isOpen: isOpenSidebar, onOpen: onOpenSidebar, onClose: onCloseSidebar } = useDisclosure();

  // First tab
  const currentTab = useMemo(() => {
    const path = router.asPath.split('?')[0]; // 移除查询参数
    const segments = path.split('/').filter(Boolean); // 过滤空字符串

    return (segments.pop() as TabEnumType) || TabEnum.apps;
  }, [router.asPath]);

  // Sub tab
  const { type: currentType, appType } = router.query as {
    type: string;
    appType?: AppTypeEnum | 'all';
  };

  // Template market
  const { data: templateTags = [], loading: isLoadingTemplatesTags } = useRequest2(
    () =>
      currentTab === TabEnum.app_templates
        ? getTemplateTagList().then((res) => [
            {
              typeId: AppTemplateTypeEnum.recommendation,
              typeName: t('app:templateMarket.templateTags.Recommendation'),
              typeOrder: 0
            },
            ...res
          ])
        : Promise.resolve([]),
    {
      manual: false,
      refreshDeps: [currentTab]
    }
  );
  const { data: templateList = [], loading: isLoadingTemplates } = useRequest2(
    () =>
      currentTab === TabEnum.app_templates
        ? getTemplateMarketItemList({ type: appType })
        : Promise.resolve([]),
    {
      manual: false,
      refreshDeps: [currentTab, appType]
    }
  );

  // System tools
  const { data: pluginGroups = [], loading: isLoadingToolGroups } = useRequest2(
    () =>
      getPluginGroups().then((res) =>
        res.map((item) => ({
          ...item,
          groupTypes: [
            {
              typeId: 'all',
              typeName: t('app:type.All')
            },
            ...item.groupTypes
          ]
        }))
      ),
    {
      manual: false
    }
  );

  const groupList = useMemo<
    {
      groupId: string;
      groupAvatar: string;
      groupName: string;
      children: {
        typeId: string;
        typeName: string;
        isActive?: boolean;
        onClick?: () => void;
      }[];
    }[]
  >(() => {
    return [
      {
        groupId: TabEnum.apps,
        groupAvatar: 'common/app',
        groupName: t('common:core.module.template.Team app'),
        children: [
          {
            isActive: !currentType,
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
        ]
      },
      ...pluginGroups.map((group) => ({
        groupId: group.groupId,
        groupAvatar: group.groupAvatar,
        groupName: t(group.groupName as any),
        children: group.groupTypes.map((type, index) => ({
          typeId: type.typeId,
          typeName: t(type.typeName as any),
          isActive: index === 0 && !currentType
        }))
      })),
      {
        groupId: TabEnum.app_templates,
        groupAvatar: 'common/templateMarket',
        groupName: t('common:template_market'),
        children: [
          ...templateTags
            .map((tag) => {
              const templates = templateList.filter((template) =>
                template.tags.includes(tag.typeId)
              );
              return {
                ...tag,
                templates
              };
            })
            .filter((tag) => tag.templates.length > 0)
            .map((tag, index) => ({
              typeId: tag.typeId,
              typeName: t(tag.typeName as any),
              isActive: index === 0 && !currentType
            })),
          ...(feConfigs?.appTemplateCourse
            ? [
                {
                  typeId: AppTemplateTypeEnum.contribute,
                  typeName: t('common:contribute_app_template'),
                  onClick: () => {
                    window.open(feConfigs.appTemplateCourse);
                  }
                }
              ]
            : [])
        ]
      },
      {
        groupId: TabEnum.mcp_server,
        groupAvatar: 'key',
        groupName: t('common:mcp_server'),
        children: []
      }
    ];
  }, [currentType, feConfigs.appTemplateCourse, pluginGroups, t, templateList, templateTags]);

  const MenuIcon = useMemo(
    () => (
      <Flex alignItems={'center'}>
        {isOpenSidebar && (
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="blackAlpha.600"
            onClick={onCloseSidebar}
            zIndex={99}
          />
        )}
        <MyIcon name="menu" w={'1.25rem'} mr={1.5} onClick={onOpenSidebar} />
      </Flex>
    ),
    [isOpenSidebar, onCloseSidebar, onOpenSidebar]
  );

  const isLoading = isLoadingTemplatesTags || isLoadingTemplates || isLoadingToolGroups;

  return (
    <Box h={'100%'}>
      {/* Side bar */}
      {(isPc || isOpenSidebar) && (
        <MyBox
          isLoading={isLoading}
          position={'fixed'}
          left={isPc ? navbarWidth : 0}
          top={0}
          bg={'myGray.25'}
          w={`220px`}
          h={'full'}
          borderLeft={'1px solid'}
          borderRight={'1px solid'}
          borderColor={'myGray.200'}
          pt={4}
          px={2.5}
          pb={2.5}
          zIndex={100}
          userSelect={'none'}
        >
          {groupList.map((group) => {
            const selected = currentTab === group.groupId;

            return (
              <Box key={group.groupId}>
                <Flex
                  p={2}
                  fontSize={'sm'}
                  rounded={'md'}
                  color={'myGray.700'}
                  cursor={'pointer'}
                  _hover={{
                    bg: 'primary.50'
                  }}
                  mb={0.5}
                  onClick={() => {
                    router.push(`/dashboard/${group.groupId}`);
                    onCloseSidebar();
                  }}
                  {...(group.children.length === 0 &&
                    selected && { bg: 'primary.100', color: 'primary.600' })}
                >
                  <Avatar src={group.groupAvatar} w={'1rem'} mr={1.5} />
                  <Box fontWeight={'medium'}>{group.groupName}</Box>
                  <Box flex={1} />
                  {group.children.length > 0 && (
                    <MyIcon
                      name={selected ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
                      w={'1rem'}
                    />
                  )}
                </Flex>
                {selected && (
                  <Box>
                    {group.children.map((child) => {
                      const isActive = child.isActive || child.typeId === currentType;

                      return (
                        <Flex
                          key={child.typeId}
                          fontSize={'sm'}
                          fontWeight={500}
                          rounded={'md'}
                          py={2}
                          pl={'30px'}
                          cursor={'pointer'}
                          mb={0.5}
                          _hover={{ bg: 'primary.50' }}
                          {...(isActive
                            ? {
                                bg: 'primary.50',
                                color: 'primary.600'
                              }
                            : {
                                bg: 'transparent',
                                color: 'myGray.500'
                              })}
                          onClick={() => {
                            if (child.onClick) {
                              child.onClick();
                            } else {
                              router.push({
                                query: {
                                  ...router.query,
                                  type: child.typeId
                                }
                              });
                              onCloseSidebar();
                            }
                          }}
                        >
                          {child.typeName}
                        </Flex>
                      );
                    })}
                  </Box>
                )}
              </Box>
            );
          })}
        </MyBox>
      )}

      <Box h={'100%'} pl={isPc ? `220px` : 0} position={'relative'}>
        {children({
          templateTags,
          templateList,
          pluginGroups,
          MenuIcon
        })}
      </Box>
    </Box>
  );
};

export default DashboardContainer;
