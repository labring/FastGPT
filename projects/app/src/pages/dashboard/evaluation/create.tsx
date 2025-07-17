import MyBox from '@fastgpt/web/components/common/MyBox';
import DashboardContainer from '../../../pageComponents/dashboard/Container';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Input, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useForm } from 'react-hook-form';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import AppSelect from '@/components/Select/AppSelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FileSelector, {
  type SelectFileItemType
} from '@/pageComponents/dataset/detail/components/FileSelector';
import { Trans } from 'next-i18next';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppDetailById } from '@/web/core/app/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { fileDownload } from '@/web/common/file/utils';
import { postCreateEvaluation } from '@/web/core/app/api/evaluation';
import { useMemo, useState } from 'react';
import Markdown from '@/components/Markdown';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getEvaluationFileHeader } from '@fastgpt/global/core/app/evaluation/utils';
import { evaluationFileErrors } from '@fastgpt/global/core/app/evaluation/constants';

type EvaluationFormType = {
  name: string;
  agentModel: string;
  appId: string;
  evaluationFiles: SelectFileItemType[];
};

const EvaluationCreating = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();

  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { teamPlanStatus } = useUserStore();
  const { defaultModels, datasetModelList, subPlans } = useSystemStore();

  const standardPlan = teamPlanStatus?.standard;
  const evalItemsCount = useMemo(() => {
    if (!standardPlan?.currentSubLevel || !subPlans?.standard) return 1000;

    return subPlans.standard[standardPlan.currentSubLevel]?.evalItemsCount;
  }, [standardPlan?.currentSubLevel, subPlans?.standard]);

  const { register, setValue, watch, handleSubmit } = useForm<EvaluationFormType>({
    defaultValues: {
      name: '',
      agentModel:
        defaultModels.datasetTextLLM?.model || getWebDefaultLLMModel(datasetModelList)?.model,
      appId: '',
      evaluationFiles: [] as SelectFileItemType[]
    }
  });

  const name = watch('name');
  const agentModel = watch('agentModel');
  const appId = watch('appId');
  const evaluationFiles = watch('evaluationFiles');

  const { runAsync: getAppDetail, loading: isLoadingAppDetail } = useRequest2(() => {
    if (appId) return getAppDetailById(appId);
    return Promise.resolve(null);
  });

  const handleDownloadTemplate = async () => {
    const appDetail = await getAppDetail();
    const variables = appDetail?.chatConfig.variables;
    const templateContent = getEvaluationFileHeader(variables);

    fileDownload({
      text: templateContent,
      type: 'text/csv;charset=utf-8',
      filename: `${appDetail?.name}_evaluation.csv`
    });
  };

  const { runAsync: createEvaluation, loading: isCreating } = useRequest2(
    async (data: EvaluationFormType) => {
      await postCreateEvaluation({
        file: data.evaluationFiles[0].file,
        name: data.name,
        agentModel: data.agentModel,
        appId: data.appId,
        percentListen: setPercent
      });
    },
    {
      onSuccess: () => {
        toast({
          title: t('dashboard_evaluation:evaluation_created'),
          status: 'success'
        });

        router.push('/dashboard/evaluation');
      },
      onError: (error) => {
        if (error.message === evaluationFileErrors) {
          setError(error.message);
        }
      }
    }
  );

  const onSubmit = async (data: EvaluationFormType) => {
    if (!data.appId) {
      return toast({
        title: t('dashboard_evaluation:app_required'),
        status: 'warning'
      });
    }
    if (!data.evaluationFiles || data.evaluationFiles.length === 0) {
      return toast({
        title: t('dashboard_evaluation:file_required'),
        status: 'warning'
      });
    }

    await createEvaluation(data);
  };

  return (
    <DashboardContainer>
      {() => (
        <MyBox h={'100%'} px={6} py={4} bg={'white'}>
          <Button
            onClick={() => {
              router.push('/dashboard/evaluation');
            }}
            variant={'whitePrimary'}
            leftIcon={<MyIcon name={'common/backFill'} w={4} />}
          >
            {t('dashboard_evaluation:back')}
          </Button>
          <VStack py={8} gap={4}>
            <Flex gap={20}>
              <FormLabel
                w={'80px'}
                h={9}
                display={'flex'}
                alignItems={'center'}
                color={'myGray.900'}
                fontSize={'14px'}
                fontWeight={'medium'}
              >
                {t('dashboard_evaluation:Task_name')}
              </FormLabel>
              <Input
                w={'406px'}
                h={9}
                bg={'myGray.50'}
                autoFocus
                {...register('name', {
                  required: true
                })}
              />
            </Flex>
            <Flex gap={20}>
              <FormLabel
                w={'80px'}
                h={9}
                display={'flex'}
                alignItems={'center'}
                color={'myGray.900'}
                fontSize={'14px'}
                fontWeight={'medium'}
              >
                {t('dashboard_evaluation:Evaluation_model')}
              </FormLabel>
              <AIModelSelector
                w={'406px'}
                bg={'myGray.50'}
                value={agentModel}
                list={datasetModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(e) => {
                  setValue('agentModel', e);
                }}
              />
            </Flex>
            <Flex gap={20}>
              <FormLabel
                w={'80px'}
                h={9}
                display={'flex'}
                alignItems={'center'}
                color={'myGray.900'}
                fontSize={'14px'}
                fontWeight={'medium'}
              >
                {t('dashboard_evaluation:Evaluation_app')}
                <QuestionTip
                  label={t('dashboard_evaluation:Evaluation_app_tip')}
                  ml={1}
                  w={'18px'}
                  h={'18px'}
                />
              </FormLabel>
              <Flex w={'406px'} flexDirection={'column'}>
                <AppSelect
                  value={appId}
                  onSelect={(id) => {
                    setValue('appId', id);
                  }}
                />
                {appId && (
                  <Button
                    variant={'whiteBase'}
                    size={'sm'}
                    w={'232px'}
                    h={9}
                    mt={2}
                    leftIcon={<MyIcon name={'common/download'} w={4} />}
                    onClick={handleDownloadTemplate}
                    isLoading={isLoadingAppDetail}
                  >
                    {t('dashboard_evaluation:click_to_download_template')}
                  </Button>
                )}
              </Flex>
            </Flex>
            <Flex gap={20}>
              <FormLabel
                w={'80px'}
                h={9}
                display={'flex'}
                alignItems={'center'}
                color={'myGray.900'}
                fontSize={'14px'}
                fontWeight={'medium'}
              >
                {t('dashboard_evaluation:Evaluation_file')}
              </FormLabel>
              {appId ? (
                <Flex w={'406px'} flexDirection={'column'}>
                  <FileSelector
                    w={'full'}
                    maxCount={1}
                    maxSize={t('dashboard_evaluation:evaluation_file_max_size', {
                      count: evalItemsCount
                    })}
                    fileType=".csv"
                    selectFiles={evaluationFiles}
                    setSelectFiles={(e) => {
                      setValue('evaluationFiles', e);
                    }}
                    FileTypeNode={
                      <Box fontSize={'xs'}>
                        <Trans
                          i18nKey={'dashboard_evaluation:template_csv_file_select_tip'}
                          values={{
                            fileType: '.csv'
                          }}
                          components={{
                            highlight: <Box as="span" color="primary.600" fontWeight="medium" />
                          }}
                        />
                      </Box>
                    }
                  />
                  {evaluationFiles && evaluationFiles.length > 0 && (
                    <VStack mt={4} gap={2}>
                      {evaluationFiles.map((item, index) => (
                        <Flex
                          key={index}
                          w={'100%'}
                          bg={error ? 'red.50' : 'myGray.100'}
                          border={'1px solid'}
                          borderColor={error ? 'red.500' : 'transparent'}
                          p={2}
                          borderRadius={'md'}
                          alignItems={'center'}
                        >
                          <MyIcon name={item.icon as any} w={'1rem'} mr={2} />
                          <Box
                            color={'myGray.900'}
                            flex={1}
                            whiteSpace={'nowrap'}
                            textOverflow={'ellipsis'}
                            overflow={'hidden'}
                            fontSize={'14px'}
                          >
                            {item.name}
                          </Box>

                          <MyIconButton
                            icon="close"
                            hoverColor="red.500"
                            hoverBg="red.50"
                            onClick={() => {
                              setValue(
                                'evaluationFiles',
                                evaluationFiles.filter((_, i) => i !== index)
                              );

                              setError(null);
                            }}
                          />
                        </Flex>
                      ))}
                    </VStack>
                  )}
                  {error && (
                    <Box mt={4}>
                      <Flex alignItems={'center'} mb={2}>
                        <Box fontSize={14} mr={3} color={'myGray.900'}>
                          {t('dashboard_evaluation:check_format')}
                        </Box>
                        <Box
                          fontSize={11}
                          fontWeight={'medium'}
                          px={3}
                          py={1.5}
                          bg={'red.50'}
                          borderRadius={'sm'}
                          color={'red.500'}
                        >
                          {t('dashboard_evaluation:check_error')}
                        </Box>
                      </Flex>
                      <Markdown source={t('dashboard_evaluation:check_error_tip')} />
                    </Box>
                  )}
                </Flex>
              ) : (
                <Flex w={'406px'} fontSize={14} color={'myGray.500'} alignItems={'center'}>
                  {t('dashboard_evaluation:app_required')}
                </Flex>
              )}
            </Flex>
            <Flex w={'566px'} justifyContent={'flex-end'}>
              <Button
                h={9}
                mt={12}
                onClick={handleSubmit(onSubmit)}
                isLoading={isCreating}
                isDisabled={
                  !!error ||
                  !name ||
                  !agentModel ||
                  !appId ||
                  !evaluationFiles ||
                  evaluationFiles.length === 0
                }
              >
                {isCreating
                  ? percent === 100
                    ? t('dashboard_evaluation:task_creating')
                    : t('dashboard_evaluation:file_uploading', { num: percent })
                  : t('dashboard_evaluation:start_evaluation')}
              </Button>
            </Flex>
          </VStack>
        </MyBox>
      )}
    </DashboardContainer>
  );
};

export default EvaluationCreating;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dashboard_evaluation', 'file']))
    }
  };
}
