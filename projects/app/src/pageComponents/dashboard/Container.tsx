import { Box, Button, Flex, Progress, useDisclosure } from '@chakra-ui/react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo } from 'react';
import { AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { navbarWidth } from '@/components/Layout';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTemplateMarketItemList, getTemplateTagList } from '@/web/core/app/api/template';
import type { AppTemplateSchemaType, TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';

import { useUserStore } from '@/web/support/user/useUserStore';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { useLocalStorageState } from 'ahooks';
import { getOperationalAd } from '@/web/common/system/api';

export enum TabEnum {
  apps = 'apps',
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
    templateList: AppTemplateSchemaType[];
    MenuIcon: JSX.Element;
  }) => React.ReactNode;
}) => {
  const router = useRouter();
  const { t, i18n } = useTranslation();
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
        tooltipLabel?: React.ReactNode;
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
            typeId: AppTypeEnum.agent,
            typeName: 'AI Agent'
          },
          {
            typeId: AppTypeEnum.workflow,
            typeName: t('app:type.Workflow bot')
          },
          {
            typeId: AppTypeEnum.plugin,
            typeName: t('app:type.Plugin')
          },
          {
            typeId: AppTypeEnum.simple,
            typeName: t('app:type.Simple bot'),
            tooltipLabel: (
              <Box px={2} py={2}>
                <Box mb={2} fontSize={'mini'}>
                  简易应用模式已废弃，将在2026/01/01清除相关数据。 请及时将简易应用转为工作流。
                </Box>
              </Box>
            )
          }
        ]
      },
      {
        groupId: 'tools',
        groupAvatar: 'core/app/type/plugin',
        groupName: t('common:navbar.Tools'),
        children: [
          {
            typeId: 'mcp',
            typeName: 'MCP 工具集'
          },
          {
            typeId: 'http',
            typeName: 'HTTP 工具集'
          }
        ]
      },
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
  }, [
    currentType,
    feConfigs.appTemplateCourse,
    feConfigs?.isPlus,
    i18n.language,
    t,
    templateList,
    templateTags
  ]);

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
          display={'flex'}
          flexDirection={'column'}
          justifyContent={'space-between'}
        >
          <Box>
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
                            {child.tooltipLabel && (
                              <MyTooltip label={child.tooltipLabel} placement={'right'}>
                                <MyIcon
                                  name="common/warn"
                                  w={'12px'}
                                  h={'12px'}
                                  ml={1}
                                  cursor={'pointer'}
                                />
                              </MyTooltip>
                            )}
                          </Flex>
                        );

                        return childContent;
                      })}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
          <TeamPlanStatusCard />
        </MyBox>
      )}

      <Box h={'100%'} pl={isPc ? `220px` : 0} position={'relative'} bg={'myGray.25'}>
        {children({
          templateTags,
          templateList,
          MenuIcon
        })}
      </Box>
    </Box>
  );
};

const TeamPlanStatusCard = () => {
  const { t } = useTranslation();
  const { teamPlanStatus } = useUserStore();

  const { data: operationalAd } = useRequest2(() => getOperationalAd(), {
    manual: false
  });

  const [hiddenUntil, setHiddenUntil] = useLocalStorageState<number | undefined>(
    'team-plan-banner-hidden-until',
    {
      defaultValue: undefined
    }
  );

  const planName = useMemo(() => {
    if (!teamPlanStatus?.standard?.currentSubLevel) return '';
    return standardSubLevelMap[teamPlanStatus.standard.currentSubLevel].label;
  }, [teamPlanStatus?.standard?.currentSubLevel]);

  const aiPointsUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        value: 0,
        max: t('account_info:unlimited'),
        rate: 0
      };
    }

    return {
      value: Math.round(teamPlanStatus.usedPoints),
      max: teamPlanStatus.totalPoints,
      rate:
        ((teamPlanStatus.totalPoints - teamPlanStatus.usedPoints) / teamPlanStatus.totalPoints) *
        100
    };
  }, [t, teamPlanStatus]);

  const valueColorSchema = useCallback((val: number) => {
    if (val < 50) return 'red';
    if (val < 80) return 'yellow';
    return 'green';
  }, []);

  const shouldHide = useMemo(() => {
    if (!hiddenUntil) return false;
    return Date.now() < hiddenUntil;
  }, [hiddenUntil]);

  const handleClose = useCallback(() => {
    const hideUntilTime = Date.now() + 24 * 60 * 60 * 1000;
    setHiddenUntil(hideUntilTime);
  }, [setHiddenUntil]);

  return (
    <Box
      p={2}
      borderRadius={'md'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      fontSize={'xs'}
      fontWeight={'medium'}
    >
      {!shouldHide && operationalAd?.operationalAdImage && (
        <Flex mb={2} position={'relative'}>
          <Box
            as="img"
            rounded={'sm'}
            src={operationalAd.operationalAdImage}
            alt="operational advertisement"
            width="100%"
            objectFit="cover"
            cursor={'pointer'}
            onClick={() => {
              if (operationalAd?.operationalAdLink) {
                window.open(operationalAd.operationalAdLink, '_blank');
              }
            }}
          />
          <Box
            bg={'rgba(23, 23, 23, 0.05)'}
            rounded={'full'}
            position={'absolute'}
            w={4}
            h={4}
            top={0.5}
            right={0.5}
            display={'flex'}
            justifyContent={'center'}
            alignItems={'center'}
            cursor={'pointer'}
            _hover={{
              bg: 'rgba(23, 23, 23, 0.1)'
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
          >
            <MyIcon name={'common/closeLight'} w={3} />
          </Box>
        </Flex>
      )}

      <Flex flexDirection={'column'} gap={1}>
        <Flex color={'myGray.500'}>
          <Box>剩余积分：</Box>
          <Flex gap={0.5}>
            <Box color={`${valueColorSchema(aiPointsUsageMap.rate)}.400`}>
              {aiPointsUsageMap.value}
            </Box>
            /<Box>{aiPointsUsageMap.max}</Box>
          </Flex>
        </Flex>
        <Progress
          size={'sm'}
          value={aiPointsUsageMap.rate}
          colorScheme={valueColorSchema(aiPointsUsageMap.rate)}
          borderRadius={'md'}
          isAnimated
          hasStripe
          borderWidth={'1px'}
          borderColor={'borderColor.low'}
        />
        <Flex>
          <Box color={'myGray.500'}> {t('user:current_package')}</Box>
          <Box color={'primary.400'}>{t(planName as any)}</Box>
        </Flex>
        <Button
          borderRadius={'6px'}
          bg={'linear-gradient(90deg, #64C2DB 0%, #7476ED 29.42%, #C994DF 57.87%, #E56F8C 95.82%)'}
          color={'white'}
          w={'full'}
          leftIcon={<MyIcon name={'common/rocket'} w={4} />}
        >
          去升级
        </Button>
      </Flex>
    </Box>
  );
};

export default DashboardContainer;
