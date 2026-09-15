'use client';
import React from 'react';
import { Box, Flex, Grid, GridItem, HStack, Skeleton } from '@chakra-ui/react';
import { GET } from '@/web/admin/common/request';
import BoxCard from '@/components/admin/BoxContainer/Card';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type {
  GetUserStatsResponseType,
  GetAppStatsResponseType,
  GetDatasetStatsResponseType
} from '@fastgpt/global/openapi/admin/core/dashboard/api';
import DashboardHeader from '@/pageComponents/admin/dashboard/Header';

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
  const { data: userStats, loading: userStatsLoading } = useRequest(
    () => GET<GetUserStatsResponseType>(`/proApi/admin/core/dashboard/getUserStats`),
    { manual: false }
  );
  const userItems = [
    {
      icon: 'support/user/userLight',
      title: '用户总数',
      count: userStats?.usersCount,
      color: 'blue',
      isLoading: userStatsLoading
    },
    {
      icon: 'support/bill/payRecordLight',
      title: '充值总额',
      count: userStats?.rechargeCount,
      color: 'purple',
      isLoading: userStatsLoading
    }
  ];

  const { data: appStats, loading: appStatsLoading } = useRequest(
    () => GET<GetAppStatsResponseType>(`/proApi/admin/core/dashboard/getAppStats`),
    { manual: false }
  );
  const appItems = [
    {
      icon: 'core/app/simpleBot',
      title: '对话 Agent',
      count: appStats?.simpleAppCount,
      color: 'teal',
      isLoading: appStatsLoading
    },
    {
      icon: 'core/app/type/workflowFill',
      title: '工作流 Agent',
      count: appStats?.workflowCount,
      color: 'blue',
      isLoading: appStatsLoading
    },
    {
      icon: 'core/app/type/pluginFill',
      title: '工作流工具',
      count: appStats?.workflowToolCount,
      color: 'cyan',
      isLoading: appStatsLoading
    },
    {
      icon: 'core/app/type/httpPluginFill',
      title: 'HTTP 工具',
      count: appStats?.httpToolCount,
      color: 'orange',
      isLoading: appStatsLoading
    },
    {
      icon: 'core/app/type/mcpToolsFill',
      title: 'MCP 工具',
      count: appStats?.mcpToolCount,
      color: 'purple',
      isLoading: appStatsLoading
    }
  ];

  const { data: datasetStats, loading: datasetStatsLoading } = useRequest(
    () => GET<GetDatasetStatsResponseType>(`/proApi/admin/core/dashboard/getDatasetStats`),
    { manual: false }
  );
  const datasetItems = [
    {
      icon: 'core/dataset/commonDatasetColor',
      title: '通用知识库',
      count: datasetStats?.commonDatasetCount,
      color: 'blue',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/websiteDatasetColor',
      title: 'Web 站点',
      count: datasetStats?.websiteDatasetCount,
      color: 'pink',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/externalDatasetColor',
      title: 'API知识库',
      count: datasetStats?.apiDatasetCount,
      color: 'orange',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/yuqueDatasetColor',
      title: '语雀知识库',
      count: datasetStats?.yuqueDatasetCount,
      color: 'green',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/feishuDatasetColor',
      title: '飞书知识库',
      count: datasetStats?.feishuDatasetCount,
      color: 'cyan',
      isLoading: datasetStatsLoading
    },
    {
      icon: 'core/dataset/datasetLight',
      title: '索引总量',
      count: datasetStats?.totalIndexCount,
      color: 'purple',
      isLoading: datasetStatsLoading
    }
  ];

  return (
    <BoxCard>
      <DashboardHeader />

      {/* User Statistics */}
      <Box>
        <Flex justify={'space-between'}>
          <Box fontSize={'lg'} fontWeight={'bold'}>
            用户统计
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
            应用统计
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
            知识库统计
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
    </BoxCard>
  );
}
