import React, { useState, useCallback, useMemo } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import DashboardContainer from '../../../../pageComponents/dashboard/Container';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  Input,
  VStack,
  IconButton,
  Switch,
  HStack,
  Progress
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useForm } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useToast } from '@fastgpt/web/hooks/useToast';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import FileSelector, {
  type SelectFileItemType
} from '@/pageComponents/dataset/detail/components/FileSelector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { fileDownload } from '@/web/common/file/utils';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  postCreateEvaluationDataset,
  generateDataByUploadFile
} from '@/web/core/evaluation/dataset';

type FileImportFormType = {
  name: string;
  evaluationModel: string;
  files: File[];
  autoEvaluation: boolean;
};

const SceneGetUrlMethods = {
  evaluationDatasetDetail: (data: { collectionId: string; collectionName: string }) =>
    `/dashboard/evaluation/dataset/detail?collectionId=${data.collectionId}&collectionName=${data.collectionName}`,
  evaluationDatasetList: () => `/dashboard/evaluation?evaluationTab=datasets`
};

const FileImport = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { llmModelList } = useSystemStore();
  const [isFormValid, setIsFormValid] = useState(false);
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [percent, setPercent] = useState(0);
  const [collectionId, setCollectionId] = useState<string>(
    (router.query.collectionId as string) || ''
  );

  const collectionName = router.query.collectionName as string;
  const scene = router.query.scene as string;

  const evalModelList = useMemo(() => {
    return llmModelList.filter((item) => item.useInEvaluation);
  }, [llmModelList]);

  const { register, setValue, watch, handleSubmit } = useForm<FileImportFormType>({
    defaultValues: {
      name: '',
      evaluationModel: evalModelList[0]?.model || '',
      files: [],
      autoEvaluation: true
    }
  });

  const name = watch('name');
  const evaluationModel = watch('evaluationModel');
  const files = watch('files');
  const autoEvaluation = watch('autoEvaluation');

  // 检查表单是否有效
  const checkFormValid = useCallback(() => {
    const isValid =
      (router.query.collectionId ? true : name.trim() !== '') && selectFiles.length > 0;
    setIsFormValid(isValid);
  }, [name, selectFiles, router.query.collectionId]);

  React.useEffect(() => {
    checkFormValid();
  }, [checkFormValid]);

  React.useEffect(() => {
    setValue(
      'files',
      selectFiles.map((item) => item.file)
    );
  }, [setValue, selectFiles]);

  // 根据场景获取跳转URL
  const getRedirectUrl = () => {
    if (scene && SceneGetUrlMethods[scene as keyof typeof SceneGetUrlMethods]) {
      if (scene === 'evaluationDatasetDetail') {
        return SceneGetUrlMethods.evaluationDatasetDetail({
          collectionId,
          collectionName: collectionName
        });
      } else if (scene === 'evaluationDatasetList') {
        return SceneGetUrlMethods.evaluationDatasetList();
      }
    }
    // 默认跳转到评测数据集列表
    return '/dashboard/evaluation?evaluationTab=datasets';
  };

  const { runAsync: onSubmitForm, loading: isSubmitting } = useRequest2(
    async (data: FileImportFormType) => {
      let currentCollectionId = collectionId;

      // 如果collectionId不存在，先创建评测数据集
      if (!currentCollectionId) {
        currentCollectionId = await postCreateEvaluationDataset({
          name: data.name
        });
        setCollectionId(currentCollectionId);
      }

      // 使用 generateDataByUploadFile 上传多个文件
      await generateDataByUploadFile({
        fileList: data.files,
        percentListen: setPercent,
        collectionId: currentCollectionId,
        enableQualityEvaluation: data.autoEvaluation,
        evaluationModel: data.autoEvaluation ? data.evaluationModel : undefined
      });
    },
    {
      successToast: t('dashboard_evaluation:file_import_success'),
      onSuccess() {
        router.push(getRedirectUrl());
      }
    }
  );

  const handleDownloadTemplate = () => {
    const templateContent = `userInput,expectedOutput,actualOutput,context,retrievalContext,metadata
"What is the capital of France?","Paris","","","","{}"
"How do you install FastGPT?","Follow the installation guide in the documentation","","","","{}"
"What are the main features of FastGPT?","AI Agent construction platform with data processing and visual workflow orchestration","","","","{}"`;
    fileDownload({
      text: templateContent,
      type: 'text/csv;charset=utf-8',
      filename: 'evaluation_template.csv'
    });
  };

  const onSubmit = async (data: FileImportFormType) => {
    // 只有在没有collectionId时才检查名称
    if (!router.query.collectionId && !data.name) {
      return toast({
        title: t('dashboard_evaluation:file_import_name_placeholder'),
        status: 'warning'
      });
    }

    if (!data.files || data.files.length === 0) {
      return toast({
        title: t('dashboard_evaluation:file_import_select_file'),
        status: 'warning'
      });
    }

    await onSubmitForm(data);
  };

  return (
    <DashboardContainer>
      {() => (
        <MyBox h={'100%'} px={6} py={4} bg={'white'} overflow={'auto'}>
          <Flex alignItems={'center'}>
            <IconButton
              icon={<MyIcon name={'common/backFill'} w={'14px'} />}
              aria-label={''}
              size={'smSquare'}
              borderRadius={'50%'}
              variant={'whiteBase'}
              mr={2}
              onClick={() => router.push(getRedirectUrl())}
            />
            {t('dashboard_evaluation:file_import_back')}
          </Flex>
          <VStack gap={4} align="stretch" maxW={['90vw', '800px']} mx="auto">
            <VStack
              as="form"
              id="file-import-form"
              spacing={6}
              align="stretch"
              onSubmit={handleSubmit(onSubmit)}
              px={7}
              py={4}
            >
              {/* 名称输入框 - 只在没有collectionId时显示 */}
              {!router.query.collectionId && (
                <HStack>
                  <FormLabel mb={1} w="110px" mr="54px">
                    {t('dashboard_evaluation:file_import_name_label')}
                  </FormLabel>
                  <Input
                    bgColor="myGray.50"
                    placeholder={t('dashboard_evaluation:file_import_name_placeholder')}
                    autoFocus
                    flex={1}
                    {...register('name', { required: true })}
                  />
                </HStack>
              )}

              {/* 文件上传 */}
              <HStack alignItems={'flex-start'}>
                <FormLabel mb={1} w="110px" mr="54px" lineHeight={'34px'} h={'34px'}>
                  {t('dashboard_evaluation:file_import_file_label')}
                </FormLabel>
                <VStack flex={1}>
                  <Flex align="center" w={'100%'} position={'relative'}>
                    <Button
                      variant={'whiteBase'}
                      w={'100%'}
                      leftIcon={<MyIcon name={'common/download'} w={4} />}
                      onClick={handleDownloadTemplate}
                    >
                      {t('dashboard_evaluation:file_import_download_template')}
                    </Button>
                    <QuestionTip
                      position={'absolute'}
                      top="10px"
                      label={t('dashboard_evaluation:file_import_download_template_tip')}
                      ml={1}
                    />
                  </Flex>
                  <FileSelector
                    fileType=".csv"
                    selectFiles={selectFiles}
                    w={'100%'}
                    setSelectFiles={(e) => setSelectFiles(e)}
                  />

                  {/* 渲染已选择的文件 */}
                  {selectFiles.length > 0 && (
                    <VStack
                      mt={4}
                      gap={2}
                      w={'100%'}
                      maxH={'200px'}
                      overflowY={'auto'}
                      borderColor={'myGray.200'}
                      borderRadius={'md'}
                      p={3}
                    >
                      {selectFiles.map((item, index) => (
                        <VStack key={index} w={'100%'} align="stretch">
                          <HStack w={'100%'}>
                            <MyIcon name={item.icon as any} w={'1rem'} />
                            <Box color={'myGray.900'}>{item.name}</Box>
                            <Box fontSize={'xs'} color={'myGray.500'} flex={1}>
                              {item.size}
                            </Box>
                            <MyIconButton
                              icon="delete"
                              hoverColor="red.500"
                              hoverBg="red.50"
                              onClick={() => {
                                setSelectFiles(selectFiles.filter((_, i) => i !== index));
                              }}
                            />
                          </HStack>
                          {/* 显示上传进度条 */}
                          {isSubmitting && (
                            <Progress
                              value={percent}
                              size="sm"
                              colorScheme="blue"
                              borderRadius="md"
                              ml={6}
                            />
                          )}
                        </VStack>
                      ))}
                    </VStack>
                  )}
                </VStack>
              </HStack>

              {/* 自动评测开关 */}
              <HStack>
                <Flex align="center" mb={1} w="110px" mr="54px">
                  <FormLabel mb={0}>
                    {t('dashboard_evaluation:auto_quality_eval_after_add')}
                  </FormLabel>
                  <QuestionTip label={t('dashboard_evaluation:auto_quality_eval_add_tip')} ml={1} />
                </Flex>
                <Switch
                  isChecked={autoEvaluation}
                  onChange={(e) => setValue('autoEvaluation', e.target.checked)}
                  colorScheme="blue"
                  flex={1}
                />
              </HStack>

              {/* 质量评测模型 - 只在自动评测开启时显示 */}
              {autoEvaluation && (
                <HStack>
                  <FormLabel mb={1} w="110px" mr="54px">
                    {t('dashboard_evaluation:file_import_evaluation_model_label')}
                  </FormLabel>
                  <Box flex={1}>
                    <AIModelSelector
                      bg="myGray.50"
                      value={evaluationModel}
                      list={evalModelList.map((item) => ({
                        value: item.model,
                        label: item.name
                      }))}
                      onChange={(value) => setValue('evaluationModel', value)}
                      placeholder={t(
                        'dashboard_evaluation:file_import_evaluation_model_placeholder'
                      )}
                    />
                  </Box>
                </HStack>
              )}
            </VStack>
          </VStack>
          <Flex maxW={['90vw', '800px']} mx="auto">
            <Flex w={'100%'} justifyContent={'flex-end'} pt={'48px'} px={7}>
              <Button
                h={9}
                type="submit"
                form="file-import-form"
                isDisabled={!isFormValid}
                isLoading={isSubmitting}
              >
                {isSubmitting
                  ? percent === 100
                    ? t('dataset:data_parsing')
                    : t('dataset:data_uploading', { num: percent })
                  : t('dashboard_evaluation:file_import_confirm')}
              </Button>
            </Flex>
          </Flex>
        </MyBox>
      )}
    </DashboardContainer>
  );
};

export default FileImport;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dashboard_evaluation', 'evaluation', 'file']))
    }
  };
}
