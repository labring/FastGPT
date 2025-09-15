'use client';
import DashboardContainer from '../../../pageComponents/dashboard/Container';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { Flex } from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import EvaluationTasks from './task/index';
import EvaluationDatasets from './dataset/index';
import EvaluationDimensions from './dimension/index';
import { useRouter } from 'next/router';

type TabType = 'tasks' | 'datasets' | 'dimensions';

const Evaluation = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { evaluationTab = 'tasks' } = router.query as { evaluationTab: TabType };

  const Tab = useMemo(() => {
    return (
      <FillRowTabs<TabType>
        list={[
          { label: t('dashboard_evaluation:evaluation_tasks_tab'), value: 'tasks' },
          { label: t('dashboard_evaluation:evaluation_datasets_tab'), value: 'datasets' },
          { label: t('dashboard_evaluation:evaluation_dimensions_tab'), value: 'dimensions' }
        ]}
        value={evaluationTab}
        py={1}
        onChange={(e) => {
          router.replace({
            query: {
              ...router.query,
              evaluationTab: e
            }
          });
        }}
      />
    );
  }, [router, evaluationTab, t]);

  return (
    <DashboardContainer>
      {({ MenuIcon }) => (
        <Flex h={'full'} bg={'white'} p={6} flexDirection="column">
          <Flex h={'100%'} flexDirection={'column'} gap={4}>
            {evaluationTab === 'tasks' && <EvaluationTasks Tab={Tab} />}
            {evaluationTab === 'datasets' && <EvaluationDatasets Tab={Tab} />}
            {evaluationTab === 'dimensions' && <EvaluationDimensions Tab={Tab} />}
          </Flex>
        </Flex>
      )}
    </DashboardContainer>
  );
};

export default Evaluation;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dashboard_evaluation', 'evaluation', 'dataset']))
    }
  };
}
