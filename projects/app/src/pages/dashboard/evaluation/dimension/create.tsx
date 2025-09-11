import React, { useState, useCallback } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { useTranslation } from 'next-i18next';
import { Button, Flex, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import EditForm from '@/pageComponents/dashboard/evaluation/dimension/EditForm';
import TestRun from '@/pageComponents/dashboard/evaluation/dimension/TestRun';
import type { EvaluationDimensionForm } from '@/pageComponents/dashboard/evaluation/dimension/EditForm';
import { postCreateMetric } from '@/web/core/evaluation/dimension';
import { getErrText } from '@fastgpt/global/common/error/utils';

const DimensionCreate = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [isFormValid, setIsFormValid] = useState(false);
  const [isTestRunOpen, setIsTestRunOpen] = useState(false);
  const [currentFormData, setCurrentFormData] = useState<EvaluationDimensionForm>({
    name: '',
    description: '',
    prompt: ''
  });

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

  const { runAsync: createMetric, loading: isCreating } = useRequest2(
    async (data: EvaluationDimensionForm) => {
      await postCreateMetric({
        name: data.name,
        description: data.description,
        prompt: data.prompt
      });
    },
    {
      onSuccess: () => {
        toast({
          title: t('dashboard_evaluation:dimension_create_success'),
          status: 'success'
        });

        router.push('/dashboard/evaluation?evaluationTab=dimensions');
      },
      errorToast: '',
      onError: (error) => {
        toast({
          title: getErrText(error),
          status: 'error'
        });
      }
    }
  );

  const onSubmit = async (data: EvaluationDimensionForm) => {
    if (!data.name) {
      return toast({
        title: t('dashboard_evaluation:dimension_create_name_required'),
        status: 'warning'
      });
    }

    if (!data.prompt) {
      return toast({
        title: t('dashboard_evaluation:dimension_create_prompt_required'),
        status: 'warning'
      });
    }

    await createMetric(data);
  };

  return (
    <DashboardContainer>
      {() => (
        <MyBox h={'100%'} px={6} py={4} bg={'white'} overflow={'auto'}>
          <Button
            onClick={() => router.push('/dashboard/evaluation?evaluationTab=dimensions')}
            variant={'whitePrimary'}
            leftIcon={<MyIcon name={'common/backFill'} w={4} />}
          >
            {t('dashboard_evaluation:dimension_create_back')}
          </Button>
          <VStack gap={4} align="stretch" maxW={['90vw', '800px']} mx="auto">
            <EditForm onSubmit={onSubmit} onValidationChange={handleValidationChange} />
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
                {t('dashboard_evaluation:dimension_create_test_run')}
              </Button>
              <Button
                h={9}
                type="submit"
                form="evaluation-dimension-form"
                isDisabled={!isFormValid}
                isLoading={isCreating}
              >
                {t('dashboard_evaluation:dimension_create_confirm')}
              </Button>
            </Flex>
          </Flex>

          <TestRun isOpen={isTestRunOpen} onClose={handleCloseTestRun} formData={currentFormData} />
        </MyBox>
      )}
    </DashboardContainer>
  );
};

export default DimensionCreate;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}
