'use client';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useState } from 'react';
import { Box, Flex, Grid, GridItem, HStack, Skeleton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getAppStats, getDatasetStats, getUserStats } from '@/web/admin/dashboard/api';
import { DashboardLayout, type DashboardTab } from '@/pageComponents/admin/dashboard/Header';
import TrafficPage from './traffic';
import PaymentPage from './payment';
import ActivePage from './active';
import CostPage from './cost';

type DataItemProps = {
  icon: string;
  title: string;
  count?: number;
  color: string;
  isLoading?: boolean;
};

const DataItem = ({ icon, title, count = 0, color, isLoading = false }: DataItemProps) => {
  return (
    <Skeleton isLoaded={!isLoading} borderRadius={'md'} minW={'80px'}>
      <HStack
        bg={'white'}
        px={6}
        py={5}
        borderRadius={'xl'}
        spacing={4}
        borderWidth={'1px'}
        borderColor={'myGray.200'}
        shadow={'sm'}
        transition={'all 0.2s'}
        _hover={{
          transform: 'translateY(-2px)',
          shadow: 'md',
          borderColor: `${color}.300`
        }}
        alignItems={'center'}
      >
        <Flex
          alignItems={'center'}
          justifyContent={'center'}
          w={'48px'}
          h={'48px'}
          borderRadius={'lg'}
          bg={`${color}.50`}
          color={`${color}.600`}
          flexShrink={0}
        >
          <MyIcon name={icon as any} w={'26px'} h={'26px'} borderRadius={'md'} />
        </Flex>
        <Box flex={1} overflow={'hidden'}>
          <Box color={'myGray.500'} fontSize={'sm'} fontWeight={'medium'} mb={0.5}>
            {title}
          </Box>
          <Box fontSize={'2xl'} fontWeight={'bold'} color={'myGray.900'} lineHeight={1}>
            {count?.toLocaleString() || 0}
          </Box>
        </Box>
      </HStack>
    </Skeleton>
  );
};

export default function DashboardOverview(): JSX.Element {
  const { t } = useSafeTranslation();
  const [currentTab, setCurrentTab] = useState<DashboardTab>('overview');
  const { data: userStats, loading: userStatsLoading } = useRequest(getUserStats, {
    manual: false
  });
  const userItems = [
    {
      icon: 'support/user/userLight',
      title: t('admin:dashboard_users_count'),
      count: userStats?.usersCount,
      color: 'blue',
      isLoading: userStatsLoading
    },
    {
      icon: 'support/bill/payRecordLight',
      title: t('admin:dashboard_recharge_count'),
      count: userStats?.rechargeCount,
      color: 'purple',
      isLoading: userStatsLoading
    }
  ];

  const { data: appStats, loading: appStatsLoading } = useRequest(getAppStats, { manual: false });
  const appItems = [
    {
      icon: 'core/app/simpleBot',
      title: t('admin:dashboard_simple_app'),
      count: appStats?.simpleAppCount,
      color: 'teal',
      isLoading: appStatsLoading
    },
    {
      icon: 'core/app/type/workflowFill',
      title: t('admin:dashboard_workflow_app'),
      count: appStats?.workflowCount,
      color: 'blue',
      isLoading: appStatsLoading
    },
    {
      icon: 'core/app/type/pluginFill',
      title: t('admin:dashboard_workflow_tool'),
      count: appStats?.workflowToolCount,
      color: 'cyan',
      isLoading: appStatsLoading
    },
    {
      icon: 'core/app/type/httpPluginFill',
      title: t('admin:dashboard_http_tool'),
      count: appStats?.httpToolCount,
      color: 'orange',
      isLoading: appStatsLoading
    },
    {
      icon: 'core/app/type/mcpToolsFill',
      title: t('admin:dashboard_mcp_tool'),
      count: appStats?.mcpToolCount,
      color: 'purple',
      isLoading: appStatsLoading
    }
  ];

  const { data: datasetStats, loading: datasetStatsLoading } = useRequest(getDatasetStats, {
    manual: false
  });
  const datasetItems = [
    {
      icon: 'core/dataset/commonDatasetColor',
      title: t('admin:dashboard_common_dataset'),
      count: datasetStats?.commonDatasetCount,
      color: 'blue',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/websiteDatasetColor',
      title: t('admin:dashboard_website_dataset'),
      count: datasetStats?.websiteDatasetCount,
      color: 'pink',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/externalDatasetColor',
      title: t('admin:dashboard_api_dataset'),
      count: datasetStats?.apiDatasetCount,
      color: 'orange',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/yuqueDatasetColor',
      title: t('admin:dashboard_yuque_dataset'),
      count: datasetStats?.yuqueDatasetCount,
      color: 'green',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/feishuDatasetColor',
      title: t('admin:dashboard_feishu_dataset'),
      count: datasetStats?.feishuDatasetCount,
      color: 'cyan',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/datasetLight',
      title: t('admin:dashboard_total_index'),
      count: datasetStats?.totalIndexCount,
      color: 'purple',
      isLoading: datasetStatsLoading
    }
  ];

  const Content =
    currentTab === 'traffic'
      ? TrafficPage
      : currentTab === 'payment'
        ? PaymentPage
        : currentTab === 'active'
          ? ActivePage
          : currentTab === 'cost'
            ? CostPage
            : null;

  return (
    <DashboardLayout currentTab={currentTab} onTabChange={setCurrentTab}>
      {Content ? (
        <Content />
      ) : (
        <>
          {/* User Statistics */}
          <Box>
            <Flex justify={'space-between'}>
              <Box fontSize={'lg'} fontWeight={'bold'}>
                {t('admin:dashboard_user_stats')}
              </Box>
            </Flex>
            <Grid mt={2} templateColumns={['1fr', 'repeat(3, 1fr)']} gap={6}>
              {userItems.map((item, index) => (
                <GridItem key={index}>
                  <DataItem {...item} />
                </GridItem>
              ))}
            </Grid>
          </Box>

          {/* Application Statistics */}
          <Box mt={6}>
            <Flex justify={'space-between'}>
              <Box fontSize={'lg'} fontWeight={'bold'}>
                {t('admin:dashboard_app_stats')}
              </Box>
            </Flex>
            <Grid mt={2} templateColumns={['1fr', 'repeat(3, 1fr)']} gap={6}>
              {appItems.map((item, index) => (
                <GridItem key={index}>
                  <DataItem {...item} />
                </GridItem>
              ))}
            </Grid>
          </Box>

          {/* Dataset Statistics */}
          <Box mt={6}>
            <Flex justify={'space-between'}>
              <Box fontSize={'lg'} fontWeight={'bold'}>
                {t('admin:dashboard_dataset_stats')}
              </Box>
            </Flex>
            <Grid mt={2} templateColumns={['1fr', 'repeat(3, 1fr)']} gap={6}>
              {datasetItems.map((item, index) => (
                <GridItem key={index}>
                  <DataItem {...item} />
                </GridItem>
              ))}
            </Grid>
          </Box>
        </>
      )}
    </DashboardLayout>
  );
}
