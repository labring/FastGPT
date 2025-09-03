import React, { useState, useCallback, useMemo } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import DashboardContainer from '../../../../pageComponents/dashboard/Container';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Input, VStack, IconButton, Switch } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useForm } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import FileSelector, {
  type SelectFileItemType,
  type EvaluationFileItemType
} from '@/pageComponents/dashboard/evaluation/dataset/FileSelector';
import RenderFiles from '@/pageComponents/dashboard/evaluation/dataset/RenderFiles';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { fileDownload } from '@/web/common/file/utils';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { uploadFile2DB } from '@/web/common/file/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

type FileImportFormType = {
  name: string;
  evaluationModel: string;
  files: EvaluationFileItemType[];
  autoEvaluation: boolean;
};

const FileImport = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { llmModelList } = useSystemStore();
  const [isFormValid, setIsFormValid] = useState(false);
  const [selectFiles, setSelectFiles] = useState<EvaluationFileItemType[]>([]);

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

  const successFiles = useMemo(() => selectFiles.filter((item) => !item.errorMsg), [selectFiles]);

  // 检查表单是否有效
  const checkFormValid = useCallback(() => {
    const isValid = name.trim() !== '' && successFiles.length > 0;
    setIsFormValid(isValid);
  }, [name, successFiles]);

  React.useEffect(() => {
    checkFormValid();
  }, [checkFormValid]);

  React.useEffect(() => {
    setValue('files', successFiles);
  }, [setValue, successFiles]);

  const { runAsync: onSelectFiles, loading: uploading } = useRequest2(
    async (files: SelectFileItemType[]) => {
      await Promise.all(
        files.map(async ({ fileId, file }) => {
          try {
            const { fileId: uploadFileId } = await uploadFile2DB({
              file,
              bucketName: BucketNameEnum.dataset,
              data: {
                // TODO: 后续需要传入正确的数据集ID或其他必要参数
                datasetId: 'evaluation-dataset'
              },
              percentListen: (e) => {
                setSelectFiles((state) =>
                  state.map((item) =>
                    item.id === fileId
                      ? {
                          ...item,
                          uploadedFileRate: item.uploadedFileRate
                            ? Math.max(e, item.uploadedFileRate)
                            : e
                        }
                      : item
                  )
                );
              }
            });
            setSelectFiles((state) =>
              state.map((item) =>
                item.id === fileId
                  ? {
                      ...item,
                      dbFileId: uploadFileId,
                      isUploading: false,
                      uploadedFileRate: 100
                    }
                  : item
              )
            );
          } catch (error) {
            setSelectFiles((state) =>
              state.map((item) =>
                item.id === fileId
                  ? {
                      ...item,
                      isUploading: false,
                      errorMsg: getErrText(error)
                    }
                  : item
              )
            );
          }
        })
      );
    },
    {
      onBefore([files]) {
        setSelectFiles((state) => {
          return [
            ...state,
            ...files.map<EvaluationFileItemType>((selectFile) => {
              const { fileId, file } = selectFile;

              return {
                id: fileId,
                createStatus: 'waiting',
                file,
                sourceName: file.name,
                sourceSize: formatFileSize(file.size),
                icon: getFileIcon(file.name),
                isUploading: true,
                uploadedFileRate: 0
              };
            })
          ];
        });
      }
    }
  );

  const handleDownloadTemplate = () => {
    const templateContent = 'question,answer\n示例问题,示例答案\n';
    fileDownload({
      text: templateContent,
      type: 'text/csv;charset=utf-8',
      filename: 'evaluation_template.csv'
    });
  };

  const onSubmit = async (data: FileImportFormType) => {
    if (!data.name) {
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

    // TODO: 实现文件导入逻辑
    console.log('File import data:', data);

    toast({
      title: t('dashboard_evaluation:file_import_success'),
      status: 'success'
    });

    router.push('/dashboard/evaluation?evaluationTab=datasets');
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
              onClick={() => router.push('/dashboard/evaluation?evaluationTab=datasets')}
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
              {/* 名称输入框 */}
              <Box>
                <FormLabel required mb={1}>
                  {t('dashboard_evaluation:file_import_name_label')}
                </FormLabel>
                <Input
                  bgColor="myGray.50"
                  placeholder={t('dashboard_evaluation:file_import_name_placeholder')}
                  autoFocus
                  {...register('name', { required: true })}
                />
              </Box>

              {/* 文件上传 */}
              <Box>
                <FormLabel required mb={1}>
                  {t('dashboard_evaluation:file_import_file_label')}
                </FormLabel>
                <FileSelector
                  fileType=".csv"
                  selectFiles={selectFiles}
                  onSelectFiles={onSelectFiles}
                />

                {/* 渲染已选择的文件 */}
                <RenderFiles files={selectFiles} setFiles={setSelectFiles} />

                <Flex align="center" mt={2}>
                  <Button
                    variant={'whiteBase'}
                    size={'sm'}
                    leftIcon={<MyIcon name={'common/download'} w={4} />}
                    onClick={handleDownloadTemplate}
                    mr={2}
                  >
                    {t('dashboard_evaluation:file_import_download_template')}
                  </Button>
                  <QuestionTip
                    label={t('dashboard_evaluation:file_import_download_template_tip')}
                    ml={1}
                  />
                </Flex>
              </Box>

              {/* 自动评测开关 */}
              <Box>
                <Flex align="center" mb={1}>
                  <FormLabel required mb={0}>
                    {t('dashboard_evaluation:file_import_auto_evaluation_label')}
                  </FormLabel>
                  <QuestionTip
                    label={t('dashboard_evaluation:file_import_auto_evaluation_tip')}
                    ml={1}
                  />
                </Flex>
                <Switch
                  isChecked={autoEvaluation}
                  onChange={(e) => setValue('autoEvaluation', e.target.checked)}
                  colorScheme="blue"
                />
              </Box>

              {/* 质量评测模型 */}
              <Box>
                <FormLabel required mb={1}>
                  {t('dashboard_evaluation:file_import_evaluation_model_label')}
                </FormLabel>
                <AIModelSelector
                  bg="myGray.50"
                  value={evaluationModel}
                  list={evalModelList.map((item) => ({
                    value: item.model,
                    label: item.name
                  }))}
                  onChange={(value) => setValue('evaluationModel', value)}
                  placeholder={t('dashboard_evaluation:file_import_evaluation_model_placeholder')}
                />
              </Box>
            </VStack>
          </VStack>
          <Flex maxW={['90vw', '800px']} mx="auto">
            <Flex w={'100%'} justifyContent={'flex-end'} pt={2} px={7}>
              <Button
                h={9}
                type="submit"
                form="file-import-form"
                isDisabled={!isFormValid || uploading}
                isLoading={uploading}
              >
                {t('dashboard_evaluation:file_import_confirm')}
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
      ...(await serviceSideProps(content, ['dashboard_evaluation', 'file']))
    }
  };
}
