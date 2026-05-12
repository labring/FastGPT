// @file Dashboard 容器组件，包含新版侧边导航栏（支持展开/折叠）
import React, { useCallback, useMemo, useState } from 'react';
import { Box, Collapse, Flex, Text, VStack, useDisclosure } from '@chakra-ui/react';
import BgDecoration from './BgDecoration';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useTranslation } from 'next-i18next';
import { AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getTemplateMarketItemList, getTemplateTagList } from '@/web/core/app/api/template';
import type { AppTemplateSchemaType, TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import TeamPlanStatusCard from './TeamPlanStatusCard';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useChatStore } from '@/web/core/chat/context/useChatStore';

let savedExpandedKeys: string[] | null = null;

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

export const SIDEBAR_EXPANDED_WIDTH = '224px';
export const SIDEBAR_COLLAPSED_WIDTH = '72px';

// ===== 子组件：导航项（叶子节点） =====
type NavItemProps = {
  icon: string;
  label: string;
  collapsedLabel?: string;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  indent?: boolean;
};

const NavItem = ({
  icon,
  label,
  collapsedLabel,
  isActive,
  isCollapsed,
  onClick,
  indent = false
}: NavItemProps) => {
  const isCollapsedMain = isCollapsed && !indent;

  return (
    <Flex
      role="group"
      direction={isCollapsedMain ? 'column' : 'row'}
      align="center"
      h={indent ? '36px' : isCollapsedMain ? 'auto' : '40px'}
      py={isCollapsedMain ? '7px' : 0}
      px={isCollapsedMain ? '12px' : indent ? (isCollapsed ? '20px' : '44px') : '20px'}
      bg={isActive ? 'rgba(50, 136, 250, 0.1)' : 'transparent'}
      cursor="pointer"
      borderRadius="6px"
      _hover={{ bg: 'rgba(50, 136, 250, 0.1)' }}
      onClick={onClick}
      overflow="hidden"
      transition="background 0.1s"
    >
      {!indent && (
        <MyIcon
          name={icon as any}
          w={isCollapsedMain ? '20px' : '16px'}
          h={isCollapsedMain ? '20px' : '16px'}
          color={isActive ? '#156AD9' : '#505F73'}
          flexShrink={0}
        />
      )}
      {isCollapsedMain ? (
        <Text
          mt="4px"
          fontSize="10px"
          fontWeight={isActive ? 600 : 500}
          color={isActive ? '#156AD9' : '#2D3540'}
          _groupHover={{ color: isActive ? '#156AD9' : '#2D3540' }}
          textAlign="center"
          lineHeight="1.2"
          whiteSpace="nowrap"
        >
          {collapsedLabel || label}
        </Text>
      ) : (
        (!isCollapsed || indent) && (
          <Text
            ml={indent ? 0 : '9px'}
            fontSize={indent ? '13px' : '14px'}
            fontWeight={isActive ? 600 : indent ? 'normal' : 500}
            color={isActive ? '#156AD9' : indent ? '#3E4A59' : '#2D3540'}
            _groupHover={{ color: isActive ? '#156AD9' : indent ? '#3E4A59' : '#2D3540' }}
            whiteSpace="nowrap"
          >
            {label}
          </Text>
        )
      )}
    </Flex>
  );
};

// ===== 子组件：可展开导航分组 =====
type SubNavGroupProps = {
  icon: string;
  label: string;
  collapsedLabel?: string;
  isActive: boolean;
  isCollapsed: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  items: { key: string; label: string; path: string; activePaths?: string[] }[];
  currentPath: string;
  onItemClick: (path: string) => void;
};

const SubNavGroup = ({
  icon,
  label,
  collapsedLabel,
  isActive,
  isCollapsed,
  isExpanded,
  onToggle,
  items,
  currentPath,
  onItemClick
}: SubNavGroupProps) => (
  <Box>
    <Flex
      role="group"
      direction={isCollapsed ? 'column' : 'row'}
      align="center"
      justify={isCollapsed ? undefined : 'space-between'}
      h={isCollapsed ? 'auto' : '40px'}
      py={isCollapsed ? '7px' : 0}
      px={isCollapsed ? '12px' : '20px'}
      bg={isActive ? 'rgba(50, 136, 250, 0.1)' : 'transparent'}
      cursor="pointer"
      borderRadius="6px"
      _hover={{ bg: 'rgba(50, 136, 250, 0.1)' }}
      onClick={onToggle}
      overflow="hidden"
    >
      {isCollapsed ? (
        <>
          <MyIcon
            name={icon as any}
            w="20px"
            h="20px"
            color={isActive ? '#156AD9' : '#505F73'}
            flexShrink={0}
          />
          <Text
            mt="4px"
            fontSize="10px"
            fontWeight={isActive ? 600 : 500}
            color={isActive ? '#156AD9' : '#2D3540'}
            _groupHover={{ color: isActive ? '#156AD9' : '#2D3540' }}
            textAlign="center"
            lineHeight="1.2"
            whiteSpace="nowrap"
          >
            {collapsedLabel || label}
          </Text>
        </>
      ) : (
        <>
          <Flex align="center">
            <MyIcon
              name={icon as any}
              w="16px"
              h="16px"
              color={isActive ? '#156AD9' : '#505F73'}
              flexShrink={0}
            />
            <Text
              ml="9px"
              fontSize="14px"
              fontWeight={isActive ? 600 : 500}
              color={isActive ? '#156AD9' : '#2D3540'}
              _groupHover={{ color: isActive ? '#156AD9' : '#2D3540' }}
              whiteSpace="nowrap"
            >
              {label}
            </Text>
          </Flex>
          <MyIcon
            name={isExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
            w="16px"
            h="16px"
            color="#505F73"
            flexShrink={0}
          />
        </>
      )}
    </Flex>
    {!isCollapsed && (
      <Collapse in={isExpanded} animateOpacity>
        <VStack spacing={0} align="stretch">
          {items.map((item) => (
            <NavItem
              key={item.key}
              icon=""
              label={item.label}
              isActive={
                item.activePaths
                  ? item.activePaths.some((p) => currentPath.startsWith(p))
                  : currentPath.startsWith(item.path)
              }
              isCollapsed={false}
              onClick={() => onItemClick(item.path)}
              indent
            />
          ))}
        </VStack>
      </Collapse>
    )}
  </Box>
);

// ===== 可展开设置分组（items 有特殊类型） =====
type SettingsItem = {
  key: string;
  label: string;
  path?: string;
  isLogout?: boolean;
};

type SubNavSettingsProps = {
  icon: string;
  label: string;
  collapsedLabel?: string;
  isActive: boolean;
  isCollapsed: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  items: SettingsItem[];
  currentPath: string;
  onItemClick: (item: SettingsItem) => void;
};

const SubNavSettings = ({
  icon,
  label,
  collapsedLabel,
  isActive,
  isCollapsed,
  isExpanded,
  onToggle,
  items,
  currentPath,
  onItemClick
}: SubNavSettingsProps) => (
  <Box>
    <Flex
      role="group"
      direction={isCollapsed ? 'column' : 'row'}
      align="center"
      justify={isCollapsed ? undefined : 'space-between'}
      h={isCollapsed ? 'auto' : '40px'}
      py={isCollapsed ? '7px' : 0}
      px={isCollapsed ? '12px' : '20px'}
      bg={isActive ? 'rgba(50, 136, 250, 0.1)' : 'transparent'}
      cursor="pointer"
      borderRadius="6px"
      _hover={{ bg: 'rgba(50, 136, 250, 0.1)' }}
      onClick={onToggle}
      overflow="hidden"
    >
      {isCollapsed ? (
        <>
          <MyIcon
            name={icon as any}
            w="20px"
            h="20px"
            color={isActive ? '#156AD9' : '#505F73'}
            flexShrink={0}
          />
          <Text
            mt="4px"
            fontSize="10px"
            fontWeight={isActive ? 600 : 500}
            color={isActive ? '#156AD9' : '#2D3540'}
            _groupHover={{ color: isActive ? '#156AD9' : '#2D3540' }}
            textAlign="center"
            lineHeight="1.2"
            whiteSpace="nowrap"
          >
            {collapsedLabel || label}
          </Text>
        </>
      ) : (
        <>
          <Flex align="center">
            <MyIcon
              name={icon as any}
              w="16px"
              h="16px"
              color={isActive ? '#156AD9' : '#505F73'}
              flexShrink={0}
            />
            <Text
              ml="9px"
              fontSize="14px"
              fontWeight={isActive ? 600 : 500}
              color={isActive ? '#156AD9' : '#2D3540'}
              _groupHover={{ color: isActive ? '#156AD9' : '#2D3540' }}
              whiteSpace="nowrap"
            >
              {label}
            </Text>
          </Flex>
          <MyIcon
            name={isExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
            w="16px"
            h="16px"
            color="#505F73"
            flexShrink={0}
          />
        </>
      )}
    </Flex>
    {!isCollapsed && (
      <Collapse in={isExpanded} animateOpacity>
        <VStack spacing={0} align="stretch">
          {items.map((item) => (
            <Flex
              key={item.key}
              role="group"
              align="center"
              h="36px"
              px="44px"
              bg={
                item.path && currentPath.startsWith(item.path)
                  ? 'rgba(50, 136, 250, 0.1)'
                  : 'transparent'
              }
              cursor="pointer"
              borderRadius="6px"
              _hover={{ bg: 'rgba(50, 136, 250, 0.1)' }}
              onClick={() => onItemClick(item)}
              overflow="hidden"
            >
              <Text
                fontSize="13px"
                fontWeight={item.path && currentPath.startsWith(item.path) ? 600 : 'normal'}
                color={item.path && currentPath.startsWith(item.path) ? '#156AD9' : '#3E4A59'}
                _groupHover={{
                  color: item.path && currentPath.startsWith(item.path) ? '#156AD9' : '#3E4A59'
                }}
                whiteSpace="nowrap"
              >
                {item.label}
              </Text>
            </Flex>
          ))}
        </VStack>
      </Collapse>
    )}
  </Box>
);

// ===== 主侧边栏组件 =====
export const DashboardNavbar = ({
  isCollapsed,
  setIsCollapsed,
  hideCollapseButton = false
}: {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  hideCollapseButton?: boolean;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo, setUserInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const { openConfirm, ConfirmModal } = useConfirm({ content: t('account:confirm_logout') });
  const { lastChatAppId, lastPane } = useChatStore();

  const [expandedKeys, setExpandedKeys] = useState<string[]>(() => {
    if (savedExpandedKeys !== null) {
      return savedExpandedKeys;
    }
    const keys: string[] = [];
    const appBuildPaths = [
      '/dashboard/agent',
      '/dashboard/skill',
      '/dashboard/tool',
      '/dashboard/systemTool',
      '/dashboard/mcpServer'
    ];
    if (appBuildPaths.some((p) => router.pathname.startsWith(p))) {
      keys.push('app-build');
    }
    if (router.pathname.startsWith('/account') || router.pathname.startsWith('/config')) {
      keys.push('settings');
    }
    savedExpandedKeys = keys;
    return keys;
  });

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      savedExpandedKeys = next;
      return next;
    });
  };

  const pathname = router.pathname;
  const isActivePrefix = (prefixes: string[]) => prefixes.some((p) => pathname.startsWith(p));

  const handleLogout = useCallback(() => {
    openConfirm({
      onConfirm: () => {
        setUserInfo(null);
        router.replace('/login');
      }
    })();
  }, [openConfirm, router, setUserInfo]);

  const settingsItems = useMemo<SettingsItem[]>(
    () => [
      { key: 'info', label: t('common:personal_information'), path: '/account/info' },
      ...(feConfigs?.isPlus
        ? [
            { key: 'team', label: t('common:team'), path: '/account/team' },
            { key: 'usage', label: t('common:usage_records'), path: '/account/usage' }
          ]
        : []),
      ...(feConfigs?.show_pay && userInfo?.team?.permission.hasManagePer
        ? [{ key: 'bill', label: t('common:bills_and_invoices'), path: '/account/bill' }]
        : []),
      { key: 'thirdParty', label: t('common:third_party'), path: '/account/thirdParty' },
      ...(feConfigs?.isPlus && feConfigs?.customDomain?.enable
        ? [
            {
              key: 'customDomain',
              label: t('common:custom_domain'),
              path: '/account/customDomain'
            }
          ]
        : []),
      { key: 'model', label: t('common:model_provider'), path: '/account/model' },
      ...(userInfo?.username === 'root'
        ? [{ key: 'config', label: t('common:system_tool_manage'), path: '/config/tool' }]
        : []),
      ...(feConfigs?.show_promotion && userInfo?.team?.permission.isOwner
        ? [{ key: 'promotion', label: t('common:promotion_records'), path: '/account/promotion' }]
        : []),
      ...(userInfo?.team?.permission.hasApikeyCreatePer
        ? [{ key: 'apikey', label: t('common:api_key'), path: '/account/apikey' }]
        : []),
      ...(feConfigs?.isPlus
        ? [{ key: 'inform', label: t('common:notifications'), path: '/account/inform' }]
        : []),
      { key: 'setting', label: t('common:language'), path: '/account/setting' },
      { key: 'loginout', label: t('common:logout'), isLogout: true }
    ],
    [feConfigs, t, userInfo]
  );

  const appBuildItems = useMemo(
    () => [
      { key: 'agent', label: t('common:App'), path: '/dashboard/agent' },
      { key: 'skill', label: t('common:navbar.Skill'), path: '/dashboard/skill' },
      {
        key: 'tool',
        label: t('common:navbar.Tools'),
        path: '/dashboard/tool',
        activePaths: ['/dashboard/tool', '/dashboard/systemTool']
      },
      { key: 'mcp', label: t('common:mcp_server'), path: '/dashboard/mcpServer' }
    ],
    [t]
  );

  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  return (
    <>
      <Box
        position="fixed"
        left={0}
        top={0}
        h="100vh"
        w={sidebarWidth}
        style={{
          backgroundImage: `url('/imgs/sidebar-texture.png'), linear-gradient(180deg, rgba(242, 248, 255, 1) 0%, rgba(239, 245, 252, 1) 26%)`,
          backgroundSize: isCollapsed
            ? `${SIDEBAR_EXPANDED_WIDTH} 270px, cover`
            : '100% 270px, cover',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: isCollapsed ? 'bottom right' : 'bottom'
        }}
        zIndex={200}
        transition="width 0.2s ease"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        borderRight="1px solid"
        borderColor="myGray.200"
        userSelect="none"
      >
        {/* 顶部 Logo */}
        <Flex h="64px" pl="18px" align="center" flexShrink={0}>
          <MyImage
            w="32px"
            h="32px"
            src={feConfigs?.systemLogo || LOGO_ICON}
            flexShrink={0}
            borderRadius="8px"
          />
          {!isCollapsed && (
            <Text ml="8px" fontSize="18px" fontWeight={600} color="#12161A" whiteSpace="nowrap">
              {feConfigs?.systemTitle}
            </Text>
          )}
        </Flex>

        {/* 导航菜单区域 */}
        <Box flex={1} overflowY="auto" overflowX="hidden" px="8px">
          <VStack spacing={isCollapsed ? '16px' : 0} align="stretch">
            {/* 门户 */}
            <NavItem
              icon="navbar/chatLightNew"
              label={t('common:navbar.Chat')}
              isActive={isActivePrefix(['/chat'])}
              isCollapsed={isCollapsed}
              onClick={() => window.open(`/chat?appId=${lastChatAppId}&pane=${lastPane}`)}
            />

            {/* 应用构建（可展开） */}
            <SubNavGroup
              icon="navbar/appBuildNew"
              label={t('common:navbar.app_build')}
              collapsedLabel={t('common:navbar.app_build')}
              isActive={
                isCollapsed &&
                isActivePrefix([
                  ...appBuildItems.map((item) => item.path),
                  '/app/detail',
                  '/skill/detail'
                ])
              }
              isCollapsed={isCollapsed}
              isExpanded={expandedKeys.includes('app-build')}
              onToggle={() => {
                if (isCollapsed) {
                  router.push(appBuildItems[0].path);
                } else {
                  toggleExpand('app-build');
                }
              }}
              items={appBuildItems}
              currentPath={pathname}
              onItemClick={(path) => router.push(path)}
            />

            {/* 知识库 */}
            <NavItem
              icon="navbar/datasetLightNew"
              label={t('common:navbar.Datasets')}
              isActive={isActivePrefix(['/dataset'])}
              isCollapsed={isCollapsed}
              onClick={() => router.push('/dataset/list')}
            />

            {/* 模板市场 */}
            <NavItem
              icon="core/app/importTemplateIcon"
              label={t('common:app_market')}
              isActive={isActivePrefix(['/dashboard/templateMarket'])}
              isCollapsed={isCollapsed}
              onClick={() => router.push('/dashboard/templateMarket')}
            />

            {/* 应用测评（Beta） */}
            {feConfigs?.show_evaluation && userInfo?.team?.permission.hasEvaluationCreatePer && (
              <NavItem
                icon="navbar/evaluationNew"
                label={t('common:app_evaluation')}
                collapsedLabel={t('common:app_evaluation_collapsed')}
                isActive={isActivePrefix(['/dashboard/evaluation'])}
                isCollapsed={isCollapsed}
                onClick={() => router.push('/dashboard/evaluation')}
              />
            )}

            {/* 设置（可展开） */}
            <SubNavSettings
              icon="navbar/settingNew"
              label={t('common:Setting')}
              collapsedLabel={t('common:Setting')}
              isActive={
                isCollapsed &&
                settingsItems.some((item) => item.path && pathname.startsWith(item.path))
              }
              isCollapsed={isCollapsed}
              isExpanded={expandedKeys.includes('settings')}
              onToggle={() => {
                if (isCollapsed) {
                  const firstItem = settingsItems.find((item) => item.path);
                  if (firstItem?.path) router.push(firstItem.path);
                } else {
                  toggleExpand('settings');
                }
              }}
              items={settingsItems}
              currentPath={pathname}
              onItemClick={(item) => {
                if (item.isLogout) handleLogout();
                else if (item.path) router.push(item.path);
              }}
            />
          </VStack>
        </Box>

        {/* 底部：团队计划卡片 + 折叠按钮 */}
        <Box flexShrink={0}>
          {!isCollapsed && (
            <Box px="10px" pb="8px">
              <TeamPlanStatusCard />
            </Box>
          )}
          {!hideCollapseButton && (
            <Flex
              h="48px"
              align="center"
              cursor="pointer"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              <Flex w={SIDEBAR_COLLAPSED_WIDTH} justify="center" flexShrink={0}>
                <MyIcon name="navbar/bottomIcon" w="14px" color="#3E4A59" flexShrink={0} />
              </Flex>
            </Flex>
          )}
        </Box>
      </Box>
      <ConfirmModal />
    </>
  );
};

// ===== DashboardContainer 主组件 =====
const DashboardContainer = ({
  children
}: {
  children: (e: {
    templateTags: TemplateTypeSchemaType[];
    templateList: AppTemplateSchemaType[];
    MenuIcon: JSX.Element;
  }) => React.ReactNode;
}) => {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();
  const { isOpen: isOpenSidebar, onOpen: onOpenSidebar, onClose: onCloseSidebar } = useDisclosure();
  const { userInfo } = useUserStore();

  const [isCollapsed, setIsCollapsed] = useState(false);

  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  const currentPath = useMemo(() => router.asPath.split('?')[0], [router.asPath]);
  const currentTab = useMemo(() => {
    const segments = currentPath.split('/').filter(Boolean);
    return (segments.pop() as TabEnumType) || TabEnum.agent;
  }, [currentPath]);

  const { data: templateTags = [], loading: isLoadingTemplatesTags } = useRequest(
    () =>
      currentTab === TabEnum.app_templates
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
      refreshDeps: [currentTab]
    }
  );

  const { data: templateData, loading: isLoadingTemplates } = useRequest(
    () =>
      currentTab === TabEnum.app_templates
        ? getTemplateMarketItemList({ type: undefined })
        : Promise.resolve({ list: [], total: 0 }),
    {
      manual: false,
      refreshDeps: [currentTab]
    }
  );
  const templateList = templateData?.list || [];

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
    <MyBox isLoading={isLoading} h={'100%'}>
      {/* 新版侧边栏（仅 PC） */}
      {isPc && <DashboardNavbar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />}

      {/* 内容区域，左侧 padding 跟随侧边栏宽度 */}
      <Box
        h={'100%'}
        pl={isPc ? sidebarWidth : 0}
        position={'relative'}
        bgGradient="linear(180deg, #F2F8FF 0%, #F7F9FC 12%)"
        transition="padding-left 0.2s ease"
      >
        {[
          '/dashboard/agent',
          '/dashboard/skill',
          '/dashboard/tool',
          '/dashboard/systemTool',
          '/dashboard/templateMarket',
          '/dashboard/evaluation',
          '/dashboard/mcpServer'
        ].includes(router.pathname) && <BgDecoration />}
        <Box position="relative" zIndex={1} h="100%">
          {children({
            templateTags,
            templateList,
            MenuIcon
          })}
        </Box>
      </Box>
    </MyBox>
  );
};

export default DashboardContainer;
