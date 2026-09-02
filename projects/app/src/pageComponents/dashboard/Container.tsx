import { Box, Divider, Flex, useDisclosure } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo } from 'react';
import { AppTemplateTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { navbarWidth } from '@/components/Layout';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getTemplateMarketItemList, getTemplateTagList } from '@/web/core/app/api/template';
import type { TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import TeamPlanStatusCard from './TeamPlanStatusCard';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { AppTemplateListItemType } from '@fastgpt/global/openapi/core/app/template/api';

export enum TabEnum {
  agent = 'agent',
  skill = 'skill',
  tool = 'tool',
  system_tool = 'systemTool',
  app_templates = 'templateMarket',
  mcp_server = 'mcpServer',
  evaluation = 'evaluation'
}
type TabEnumType = `${keyof typeof TabEnum}` | string;

const DashboardContainer = ({
  children
}: {
  children: (e: {
    templateTags: TemplateTypeSchemaType[];
    templateList: AppTemplateListItemType[];
    MenuIcon: JSX.Element;
  }) => React.ReactNode;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();
  const { isOpen: isOpenSidebar, onOpen: onOpenSidebar, onClose: onCloseSidebar } = useDisclosure();
  const { userInfo } = useUserStore();
  const hasAppCreatePer = !!userInfo?.team.permission.hasAppCreatePer;

  // First tab
  const currentTab = useMemo(() => {
    const path = router.asPath.split('?')[0]; // 移除查询参数
    const segments = path.split('/').filter(Boolean); // 过滤空字符串

    return (segments.pop() as TabEnumType) || TabEnum.agent;
  }, [router.asPath]);

  // Sub tab
  const { type: currentType } = router.query as {
    type: string;
  };

  useEffect(() => {
    if (userInfo && currentTab === TabEnum.app_templates && !hasAppCreatePer) {
      router.replace('/dashboard/agent');
    }
  }, [currentTab, hasAppCreatePer, router, userInfo]);

  // Template market
  const { data: templateTags = [], loading: isLoadingTemplatesTags } = useRequest(
    () =>
      currentTab === TabEnum.app_templates && hasAppCreatePer
        ? getTemplateTagList().then((res) => [
            {
              typeId: AppTemplateTypeEnum.recommendation,
              typeName: userInfo?.team.isWecomTeam
                ? t('app:templateMarket.templateTags.WecomZone')
                : t('app:templateMarket.templateTags.Recommendation'),
              typeOrder: 0
            },
            ...res
          ])
        : Promise.resolve([]),
    {
      manual: false,
      refreshDeps: [currentTab, hasAppCreatePer, userInfo?.team.isWecomTeam]
    }
  );
  const { data: templateData, loading: isLoadingTemplates } = useRequest(
    () =>
      currentTab === TabEnum.app_templates && hasAppCreatePer
        ? getTemplateMarketItemList({ type: 'all' })
        : Promise.resolve({ list: [], total: 0 }),
    {
      manual: false,
      refreshDeps: [currentTab, hasAppCreatePer]
    }
  );
  const templateList = useMemo(() => templateData?.list ?? [], [templateData?.list]);

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
        groupId: TabEnum.agent,
        groupAvatar: 'core/chat/sidebar/star',
        groupName: 'Agents',
        // 类型筛选已移到 Agent 列表工具栏，侧栏不再挂二级菜单。
        children: []
      },
      {
        groupId: TabEnum.skill,
        groupAvatar: 'common/skill',
        groupName: t('common:navbar.Skill'),
        children: []
      },
      {
        groupId: TabEnum.tool,
        groupAvatar: 'core/app/type/plugin',
        groupName: t('common:navbar.Tools'),
        // 类型筛选已移到工具列表工具栏，侧栏不再挂二级菜单。
        children: []
      },
      {
        groupId: TabEnum.system_tool,
        groupAvatar: 'common/app',
        groupName: t('common:system_tools'),
        children: []
      },
      ...(hasAppCreatePer
        ? [
            {
              groupId: TabEnum.app_templates,
              groupAvatar: 'common/templateMarket',
              groupName: t('common:template_market'),
              // 分类筛选已移到模板市场工具栏，侧栏不再挂二级菜单。
              children: []
            }
          ]
        : []),
      {
        groupId: TabEnum.mcp_server,
        groupAvatar: 'mcp',
        groupName: t('common:mcp_server'),
        children: []
      },
      ...(feConfigs?.isPlus
        ? [
            {
              groupId: TabEnum.evaluation,
              groupAvatar: 'kbTest',
              groupName: t('common:app_evaluation'),
              children: []
            }
          ]
        : [])
    ];
  }, [feConfigs.isPlus, hasAppCreatePer, t]);

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

  const isLoading = isLoadingTemplatesTags || isLoadingTemplates;

  return (
    <Box h={'100%'}>
      {/* Side bar */}
      {(isPc || isOpenSidebar) && (
        <MyBox
          isLoading={isLoading}
          position={'fixed'}
          left={isPc ? navbarWidth : 0}
          top={0}
          bg={'white'}
          w={`220px`}
          h={'full'}
          borderLeft={'1px solid'}
          borderRight={'1px solid'}
          borderColor={'myGray.200'}
          pt={4}
          pb={2.5}
          zIndex={100}
          userSelect={'none'}
          display={'flex'}
          flexDirection={'column'}
          justifyContent={'space-between'}
        >
          <Box
            flex={1}
            overflowY={'auto'}
            px={2.5}
            sx={{ '&::-webkit-scrollbar': { width: '4px' } }}
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

                        const childContent = (
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
                            alignItems={'center'}
                          >
                            {child.typeName}
                          </Flex>
                        );

                        return childContent;
                      })}
                    </Box>
                  )}
                  {group.groupId === TabEnum.system_tool && (
                    <Divider my={1} borderColor={'myGray.200'} />
                  )}
                </Box>
              );
            })}
          </Box>
          <Box px={2.5}>
            <TeamPlanStatusCard />
          </Box>
        </MyBox>
      )}

      <Box h={'100%'} pl={isPc ? `220px` : 0} position={'relative'} bg={'white'}>
        {children({
          templateTags,
          templateList,
          MenuIcon
        })}
      </Box>
    </Box>
  );
};

export default DashboardContainer;
