import React, { useState, useCallback, useEffect } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { useTranslation } from 'next-i18next';
import { Button, Flex, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Loading from '@fastgpt/web/components/common/MyLoading';
import EditForm from '@/pageComponents/dashboard/evaluation/dimension/EditForm';
import TestRun from '@/pageComponents/dashboard/evaluation/dimension/TestRun';
import { getMetricDetail, putUpdateMetric } from '@/web/core/evaluation/dimension';
import type { EvaluationDimensionForm } from '@/pageComponents/dashboard/evaluation/dimension/EditForm';

const DimensionEdit = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [isFormValid, setIsFormValid] = useState(false);
  const [isTestRunOpen, setIsTestRunOpen] = useState(false);
  const [dimensionData, setDimensionData] = useState<EvaluationDimensionForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentFormData, setCurrentFormData] = useState<EvaluationDimensionForm>({
    name: '',
    description: '',
    prompt: ''
  });

  const dimensionId = router.query.id as string;

  // 获取维度数据的请求
  const { runAsync: fetchDimensionData, loading: isFetching } = useRequest2(
    async (id: string) => {
      const response = await getMetricDetail(id);
      return response;
    },
    {
      manual: true,
      onSuccess: (data) => {
        setDimensionData({
          name: data.name,
          description: data.description || '',
          prompt: data.prompt || ''
        });
      },
      onError: (error) => {
        console.error('get dimension data error:', error);
        toast({
          title: t('dashboard_evaluation:dimension_get_data_failed'),
          status: 'error'
        });
        router.push('/dashboard/evaluation?evaluationTab=dimensions');
      }
    }
  );

  // 获取维度数据
  useEffect(() => {
    const loadDimensionData = async () => {
      if (!dimensionId) return;

      try {
        setIsLoading(true);
        await fetchDimensionData(dimensionId);
      } finally {
        setIsLoading(false);
      }
    };

    loadDimensionData();
  }, [dimensionId, fetchDimensionData]);

  const handleValidationChange = useCallback(
    (isValid: boolean, formData?: EvaluationDimensionForm) => {
      setIsFormValid(isValid);
      if (formData) {
        setCurrentFormData(formData);
      }
    },
    []
  );

  const handleTestRun = useCallback(() => {
    setIsTestRunOpen(true);
  }, []);

  const handleCloseTestRun = useCallback(() => {
    setIsTestRunOpen(false);
  }, []);

  // 更新维度的请求
  const { runAsync: updateDimension, loading: isUpdating } = useRequest2(
    async (data: EvaluationDimensionForm) => {
      if (!dimensionId) throw new Error('dimensionId is required');

      await putUpdateMetric({
        metricId: dimensionId,
        name: data.name,
        description: data.description,
        prompt: data.prompt
      });
    },
    {
      manual: true,
      onSuccess: () => {
        toast({
          title: t('dashboard_evaluation:dimension_update_success'),
          status: 'success'
        });
        router.push('/dashboard/evaluation?evaluationTab=dimensions');
      },
      onError: (error) => {
        toast({
          title: t('dashboard_evaluation:dimension_update_failed'),
          status: 'error'
        });
      }
    }
  );

  const onSubmit = async (data: EvaluationDimensionForm) => {
    if (!data.name) {
      return toast({
        title: t('dashboard_evaluation:dimension_name_required'),
        status: 'warning'
      });
    }

    await updateDimension(data);
  };

  if (isLoading || isFetching) {
    return <DashboardContainer>{() => <Loading fixed={false} />}</DashboardContainer>;
  }

  if (!dimensionData) {
    return (
      <DashboardContainer>
        {() => (
          <MyBox h={'100%'} px={6} py={4} bg={'white'} overflow={'auto'}>
            <Flex justify="center" align="center" h="200px">
              {t('dashboard_evaluation:dimension_data_not_exist')}
            </Flex>
          </MyBox>
        )}
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer>
      {() => (
        <MyBox h={'100%'} px={6} py={4} bg={'white'} overflow={'auto'}>
          <Button
            onClick={() => router.push('/dashboard/evaluation?evaluationTab=dimensions')}
            variant={'whitePrimary'}
            leftIcon={<MyIcon name={'common/backFill'} w={4} />}
          >
            {t('dashboard_evaluation:dimension_back')}
          </Button>
          <VStack gap={4} align="stretch" maxW={['90vw', '800px']} mx="auto">
            <EditForm
              defaultValues={dimensionData}
              onSubmit={onSubmit}
              onValidationChange={handleValidationChange}
            />
          </VStack>
          <Flex maxW={['90vw', '800px']} mx="auto">
            <Flex w={'100%'} justifyContent={'flex-end'} pt={8}>
              <Button
                h={9}
                mr={3}
                variant={'outline'}
                isDisabled={!isFormValid}
                onClick={handleTestRun}
              >
                {t('dashboard_evaluation:dimension_test_run')}
              </Button>
              <Button
                h={9}
                type="submit"
                form="evaluation-dimension-form"
                isDisabled={!isFormValid}
                isLoading={isUpdating}
              >
                {t('dashboard_evaluation:dimension_save')}
              </Button>
            </Flex>
          </Flex>

          <TestRun isOpen={isTestRunOpen} onClose={handleCloseTestRun} formData={currentFormData} />
        </MyBox>
      )}
    </DashboardContainer>
  );
};

export default DimensionEdit;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dashboard_evaluation']))
    }
  };
}
