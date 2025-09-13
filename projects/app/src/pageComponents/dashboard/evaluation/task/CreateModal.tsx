import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  ModalBody,
  ModalFooter,
  Text,
  VStack,
  Collapse,
  useDisclosure
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MySelect from '@fastgpt/web/components/common/MySelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import ManageDimension, { type Dimension } from './ManageDimension';
import AppSelect from '@/components/Select/AppSelect';
import { getAppVersionList } from '@/web/core/app/api/version';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { getEvaluationDatasetList } from '@/web/core/evaluation/dataset';
import { postCreateEvaluation } from '@/web/core/evaluation/task';
import type { CreateEvaluationRequest } from '@fastgpt/global/core/evaluation/api';
import type { EvalTarget, EvaluatorSchema } from '@fastgpt/global/core/evaluation/type';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/metric/type';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getModelFromList } from '@fastgpt/global/core/ai/model';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag';
import IntelligentGeneration from '@/pageComponents/dashboard/evaluation/dataset/IntelligentGeneration';

// 表单数据类型定义
export interface TaskFormData {
  name: string;
  appId: string;
  appVersion: string;
  datasetId: string;
  selectedDimensions: Dimension[];
}

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

const defaultForm: TaskFormData = {
  name: '',
  appId: '',
  appVersion: '',
  datasetId: '',
  selectedDimensions: []
};

const CreateModal = ({ isOpen, onClose, onSubmit }: CreateModalProps) => {
  const { t } = useTranslation();
  const [isManageDimensionOpen, setIsManageDimensionOpen] = useState(false);
  const { isOpen: isDimensionExpanded, onToggle: toggleDimensionExpanded } = useDisclosure();
  const {
    isOpen: isIntelligentModalOpen,
    onOpen: onOpenIntelligentModal,
    onClose: onCloseIntelligentModal
  } = useDisclosure();
  const { llmModelList, embeddingModelList } = useSystemStore();

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: defaultForm
  });

  const watchedValues = watch();

  // 处理维度选择变化
  const handleDimensionsChange = useCallback(
    (dimensions: Dimension[]) => {
      setValue('selectedDimensions', dimensions);
    },
    [setValue]
  );

  // 删除单个维度
  const handleRemoveDimension = useCallback(
    (dimensionId: string) => {
      const currentDimensions = watchedValues.selectedDimensions || [];
      const updatedDimensions = currentDimensions.filter((d) => d.id !== dimensionId);
      setValue('selectedDimensions', updatedDimensions);
    },
    [watchedValues.selectedDimensions, setValue]
  );

  // 打开管理维度弹窗
  const handleOpenManageDimension = useCallback(() => {
    setIsManageDimensionOpen(true);
  }, []);

  const { runAsync: createTask, loading: isCreating } = useRequest2(
    async (data: TaskFormData) => {
      const target: EvalTarget = {
        type: 'workflow',
        config: {
          appId: data.appId,
          versionId: data.appVersion
        }
      };

      const evaluators: EvaluatorSchema[] = data.selectedDimensions.map((dimension) => {
        const metric: EvalMetricSchemaType = {
          _id: dimension.id,
          teamId: '',
          tmbId: '',
          name: dimension.name,
          description: dimension.description,
          type:
            dimension.type === 'builtin' ? EvalMetricTypeEnum.Builtin : EvalMetricTypeEnum.Custom,
          userInputRequired: true,
          actualOutputRequired: true,
          expectedOutputRequired: true,
          contextRequired: false,
          retrievalContextRequired: false,
          embeddingRequired: dimension.embeddingRequired,
          llmRequired: dimension.llmRequired,
          createTime: new Date(),
          updateTime: new Date()
        };

        return {
          metric,
          runtimeConfig: {
            llm: dimension.evaluationModel,
            embedding: dimension.indexModel
          }
        };
      });

      const createRequest: CreateEvaluationRequest = {
        name: data.name,
        datasetId: data.datasetId,
        target,
        evaluators
      };

      return await postCreateEvaluation(createRequest);
    },
    {
      manual: true,
      successToast: t('common:create_success'),
      errorToast: t('dashboard_evaluation:create_failed'),
      onSuccess: (result) => {
        onSubmit(result);
        onClose();
      }
    }
  );

  // 获取选中应用的版本列表
  const {
    ScrollData: VersionScrollData,
    data: appVersions,
    isLoading: isLoadingVersions
  } = useScrollPagination(getAppVersionList, {
    pageSize: 20,
    params: {
      appId: watchedValues.appId
    },
    disabled: !watchedValues.appId,
    refreshDeps: [watchedValues.appId]
  });

  // 转换版本数据为下拉选项格式
  const appVersionOptions = useMemo(() => {
    return appVersions.map((version) => ({
      label: version.versionName || formatTime2YMDHMS(version.time),
      value: version._id,
      description: formatTime2YMDHMS(version.time)
    }));
  }, [appVersions]);

  // 获取评测数据集列表
  const {
    ScrollData: DatasetScrollData,
    data: datasets,
    isLoading: isLoadingDatasets,
    refreshList: fetchDatasets
  } = useScrollPagination(getEvaluationDatasetList, {
    pageSize: 20,
    params: {
      searchKey: ''
    }
  });

  // 转换数据集数据为下拉选项格式
  const datasetOptions = useMemo(() => {
    return datasets.map((dataset) => ({
      label: dataset.name,
      value: dataset._id
    }));
  }, [datasets]);

  const selectedDimensions = watchedValues.selectedDimensions || [];

  // 获取所有模型列表用于查找模型信息
  const allModelList = useMemo(() => {
    return [...llmModelList, ...embeddingModelList];
  }, [llmModelList, embeddingModelList]);

  // 根据模型名称获取模型信息
  const getModelInfo = useCallback(
    (modelName: string) => {
      if (!modelName) return null;
      return getModelFromList(allModelList, modelName);
    },
    [allModelList]
  );

  // 处理创建数据集
  const handleCreateDataset = useCallback(
    (type: 'smart' | 'import') => {
      if (type === 'smart') {
        onOpenIntelligentModal();
      } else {
        // 在新标签页打开文件导入页面
        window.open(
          '/dashboard/evaluation/dataset/fileImport?scene=evaluationDatasetList',
          '_blank'
        );
      }
    },
    [onOpenIntelligentModal]
  );

  // 智能生成数据集确认回调
  const handleIntelligentGenerationConfirm = useCallback(() => {
    onCloseIntelligentModal();
    fetchDatasets();
  }, [onCloseIntelligentModal, fetchDatasets]);

  return (
    <>
      <MyModal
        iconSrc="modal/edit"
        title={t('dashboard_evaluation:create_new_task_modal')}
        w="100%"
        maxW={['90vw', '600px']}
        isOpen={isOpen}
        onClose={onClose}
      >
        <ModalBody>
          <VStack spacing={6} align="stretch">
            {/* 任务名 */}
            <Flex align="center" gap={4}>
              <FormLabel minW="120px" mb={0}>
                {t('dashboard_evaluation:task_name_input')}
              </FormLabel>
              <Input
                {...register('name', {
                  required: true
                })}
                placeholder={t('dashboard_evaluation:task_name_input_placeholder')}
                h={8}
                isInvalid={!!errors.name}
                flex={1}
              />
            </Flex>

            {/* 评测应用 */}
            <Flex align="center" gap={4}>
              <FormLabel minW="120px" mb={0}>
                <HStack>
                  <Text>{t('dashboard_evaluation:evaluation_app_select')}</Text>
                  <QuestionTip label={t('dashboard_evaluation:evaluation_app_support_tip')} />
                </HStack>
              </FormLabel>
              <Box flex={1}>
                <AppSelect
                  h={8}
                  bg="white"
                  value={watchedValues.appId}
                  placeholder={t('dashboard_evaluation:evaluation_app_select_placeholder')}
                  onSelect={(id) => {
                    setValue('appId', id);
                    setValue('appVersion', '');
                  }}
                />
              </Box>
            </Flex>

            {/* 评测应用版本 */}
            <Flex align="center" gap={4}>
              <FormLabel minW="120px" mb={0}>
                {t('dashboard_evaluation:evaluation_app_version_select')}
              </FormLabel>
              <Box flex={1}>
                <MySelect
                  h={8}
                  placeholder={t('dashboard_evaluation:evaluation_app_version_select_placeholder')}
                  value={watchedValues.appVersion}
                  list={appVersionOptions}
                  onChange={(val) => setValue('appVersion', val)}
                  isDisabled={!watchedValues.appId}
                  isLoading={isLoadingVersions}
                  ScrollData={VersionScrollData}
                />
              </Box>
            </Flex>

            {/* 评测数据集 */}
            <Flex align="center" gap={4}>
              <FormLabel minW="120px" mb={0}>
                {t('dashboard_evaluation:evaluation_dataset_select')}
              </FormLabel>
              <HStack flex={1}>
                <Box flex={1}>
                  <MySelect
                    h={8}
                    placeholder={t('dashboard_evaluation:evaluation_dataset_select_placeholder')}
                    value={watchedValues.datasetId}
                    list={datasetOptions}
                    onChange={(val) => setValue('datasetId', val)}
                    isLoading={isLoadingDatasets}
                    ScrollData={DatasetScrollData}
                  />
                </Box>
                <MyMenu
                  offset={[0, 5]}
                  Button={
                    <Button
                      variant="whiteBase"
                      size="md"
                      leftIcon={<MyIcon name="common/importLight" w="14px" />}
                      flexShrink={0}
                    >
                      {t('dashboard_evaluation:create_import_dataset')}
                    </Button>
                  }
                  menuList={[
                    {
                      children: [
                        {
                          label: (
                            <Flex>
                              <MyIcon name={'core/app/aiLight'} w={'20px'} mr={2} />
                              {t('dashboard_evaluation:smart_generation')}
                            </Flex>
                          ),
                          onClick: () => handleCreateDataset('smart')
                        },
                        {
                          label: (
                            <Flex>
                              <MyIcon name={'core/dataset/tableCollection'} mr={2} w={'20px'} />
                              {t('dashboard_evaluation:file_import')}
                            </Flex>
                          ),
                          onClick: () => handleCreateDataset('import')
                        }
                      ]
                    }
                  ]}
                />
              </HStack>
            </Flex>

            {/* 评测维度 */}
            <Flex align="center" gap={4}>
              <FormLabel minW="120px" mb={0}>
                {t('dashboard_evaluation:evaluation_dimensions_label')}
              </FormLabel>
              <Button
                variant="whiteBase"
                size="md"
                leftIcon={<MyIcon name="edit" w="14px" />}
                onClick={handleOpenManageDimension}
              >
                {t('dashboard_evaluation:manage_dimension')}
              </Button>
            </Flex>

            {/* 维度展开/收起区域 */}
            <Box>
              <VStack
                spacing={0}
                align="stretch"
                bg="myGray.50"
                borderRadius="md"
                overflow="hidden"
              >
                <Flex align="center" justify="space-between" p={4}>
                  <Text fontSize="sm" color="myGray.600">
                    {t('dashboard_evaluation:evaluation_dimensions_recommendation', { num: 3 })}
                  </Text>
                  <Box
                    cursor="pointer"
                    onClick={toggleDimensionExpanded}
                    _hover={{ bg: 'myGray.100' }}
                    borderRadius="sm"
                    h={'16px'}
                  >
                    <MyIcon
                      name={isDimensionExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                      w="16px"
                      h="16px"
                      color="myGray.500"
                    />
                  </Box>
                </Flex>

                {selectedDimensions.length > 0 && (
                  <Collapse in={isDimensionExpanded}>
                    <VStack spacing={0} align="stretch">
                      {selectedDimensions.map((dimension) => {
                        // 优先显示评测模型，没有评测模型则显示索引模型
                        const displayModelName =
                          dimension.evaluationModel || dimension.indexModel || '';
                        const modelInfo = getModelInfo(displayModelName);

                        return (
                          <Flex
                            key={dimension.id}
                            align="center"
                            justify="space-between"
                            p={3}
                            bg="myGray.50"
                          >
                            <HStack spacing={3}>
                              <Text
                                fontSize="sm"
                                fontWeight="medium"
                                color={'myGray.900'}
                                noOfLines={1}
                                maxW="200px"
                              >
                                {dimension.name}
                              </Text>
                              {dimension.type === 'builtin' && (
                                <MyTag colorSchema="gray" type="borderSolid" px={1.5}>
                                  {t('dashboard_evaluation:builtin_dimension')}
                                </MyTag>
                              )}
                              {displayModelName && (
                                <HStack spacing={2}>
                                  <Avatar
                                    borderRadius={'0'}
                                    src={modelInfo?.avatar}
                                    w="14px"
                                    h="14px"
                                  />
                                  <Text fontSize="xs" color="myGray.600" noOfLines={1} maxW="200px">
                                    {modelInfo?.name || displayModelName}
                                  </Text>
                                </HStack>
                              )}
                            </HStack>
                            <MyIcon
                              name="delete"
                              w="16px"
                              h="16px"
                              cursor="pointer"
                              color="myGray.500"
                              _hover={{ color: 'red.600' }}
                              onClick={() => handleRemoveDimension(dimension.id)}
                            />
                          </Flex>
                        );
                      })}
                    </VStack>
                  </Collapse>
                )}
              </VStack>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="whiteBase" mr={4} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            variant="primary"
            isLoading={isCreating}
            isDisabled={
              !watchedValues.name ||
              !watchedValues.appId ||
              !watchedValues.datasetId ||
              selectedDimensions.length === 0
            }
            onClick={handleSubmit((data) => createTask(data))}
          >
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>

      {/* 管理维度弹窗 */}
      {isManageDimensionOpen && (
        <ManageDimension
          isOpen={isManageDimensionOpen}
          onClose={() => setIsManageDimensionOpen(false)}
          selectedDimensions={selectedDimensions}
          onConfirm={handleDimensionsChange}
        />
      )}

      {/* 智能生成数据集弹窗 */}
      {isIntelligentModalOpen && (
        <IntelligentGeneration
          isOpen={isIntelligentModalOpen}
          onClose={onCloseIntelligentModal}
          onConfirm={handleIntelligentGenerationConfirm}
        />
      )}
    </>
  );
};

export default CreateModal;
