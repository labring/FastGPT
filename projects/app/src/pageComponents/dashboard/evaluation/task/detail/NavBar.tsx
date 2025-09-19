import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex, useTheme, Button, HStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { TaskPageContext } from '@/web/core/evaluation/context/taskPageContext';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import FolderPath from '@/components/common/folder/Path';
import type { EvaluationStatsResponse } from '@fastgpt/global/core/evaluation/api';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';

export enum TabEnum {
  allData = 'allData',
  questionData = 'questionData',
  errorData = 'errorData'
}

// 定义过滤参数类型
export type TabFilterParams = {
  status?: EvaluationStatusEnum;
  belowThreshold?: boolean;
};

// 获取不同 tab 对应的过滤参数
export const getTabFilterParams = (tab: TabEnum): TabFilterParams => {
  switch (tab) {
    case TabEnum.allData:
      return {}; // 不过滤
    case TabEnum.questionData:
      return { belowThreshold: true }; // 低于阈值的数据
    case TabEnum.errorData:
      return { status: EvaluationStatusEnum.error }; // 错误状态的数据
    default:
      return {};
  }
};

const NavBar = ({
  currentTab,
  statsData,
  onExport,
  onRetryFailed
}: {
  currentTab: TabEnum;
  statsData: EvaluationStatsResponse | null;
  onExport?: () => void;
  onRetryFailed?: () => void;
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const query = router.query;
  const { taskDetail } = useContextSelector(TaskPageContext, (v) => v);

  const tabList = useMemo(() => {
    const tabConfigs = [
      {
        labelKey: 'dashboard_evaluation:all_data_with_count',
        value: TabEnum.allData,
        count: statsData?.total || 0,
        shouldShow: true
      },
      {
        labelKey: 'dashboard_evaluation:question_data_with_count',
        value: TabEnum.questionData,
        count: statsData?.failed || 0,
        shouldShow: (statsData?.failed || 0) > 0
      },
      {
        labelKey: 'dashboard_evaluation:error_data_with_count',
        value: TabEnum.errorData,
        count: statsData?.error || 0,
        shouldShow: (statsData?.error || 0) > 0
      }
    ];

    return tabConfigs
      .filter((config) => config.shouldShow)
      .map((config) => ({
        label: t(config.labelKey, { num: config.count }),
        value: config.value
      }));
  }, [statsData, t]);

  // 获取有效的当前选中标签，如果匹配不到则默认选中全部数据
  const validCurrentTab = useMemo(() => {
    const validTabs = tabList.map((tab) => tab.value);
    return validTabs.includes(currentTab) ? currentTab : TabEnum.allData;
  }, [currentTab, tabList]);

  // 路径导航数据
  const paths = useMemo(
    () => [{ parentId: 'current', parentName: taskDetail?.name || '-' }],
    [taskDetail?.name]
  );

  const setCurrentTab = useCallback(
    (tab: TabEnum) => {
      router.replace({
        query: {
          taskId: query.taskId,
          currentTab: tab
        }
      });
    },
    [query, router]
  );

  const handleExport = useCallback(() => {
    onExport?.();
  }, [onExport]);

  const handleRetry = useCallback(() => {
    onRetryFailed?.();
  }, [onRetryFailed]);

  const handleNavigateBack = useCallback(() => {
    router.push('/dashboard/evaluation?evaluationTab=tasks');
  }, [router]);

  return (
    <Flex
      pb={2}
      pt={3}
      px={4}
      justify={'space-between'}
      borderBottom={theme.borders.base}
      borderColor={'myGray.200'}
      position={'relative'}
    >
      <Flex py={'0.38rem'} px={2} h={10} ml={0.5}>
        <FolderPath
          rootName={t('dashboard_evaluation:evaluation_tasks')}
          paths={paths}
          onClick={handleNavigateBack}
        />
      </Flex>

      <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
        <LightRowTabs<TabEnum>
          px={4}
          py={1}
          flex={1}
          mx={'auto'}
          w={'100%'}
          list={tabList}
          value={validCurrentTab}
          activeColor="primary.700"
          onChange={setCurrentTab}
          inlineStyles={{
            fontSize: '1rem',
            lineHeight: '1.5rem',
            fontWeight: 500,
            border: 'none',
            _hover: {
              bg: 'myGray.05'
            },
            borderRadius: '6px'
          }}
        />
      </Box>

      <HStack spacing={2}>
        <Button
          variant={'grayGhost'}
          leftIcon={<MyIcon name={'export'} w={'14px'} />}
          onClick={handleExport}
          size={'sm'}
        >
          {t('dashboard_evaluation:export_data')}
        </Button>
        {validCurrentTab === TabEnum.errorData && (
          <Button
            variant={'grayGhost'}
            leftIcon={<MyIcon name={'common/retryLight'} w={'14px'} />}
            onClick={handleRetry}
            size={'sm'}
          >
            {t('dashboard_evaluation:retry_action')}
          </Button>
        )}
      </HStack>
    </Flex>
  );
};

export default NavBar;
