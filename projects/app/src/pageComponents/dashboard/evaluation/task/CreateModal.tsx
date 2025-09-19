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
  useDisclosure,
  Link
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
import { getEvaluationList, postCreateEvaluation } from '@/web/core/evaluation/task';
import type { CreateEvaluationRequest } from '@fastgpt/global/core/evaluation/api';
import type { EvalTarget, EvaluatorSchema } from '@fastgpt/global/core/evaluation/type';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/metric/type';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getModelFromList } from '@fastgpt/global/core/ai/model';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag';
import IntelligentGeneration from '@/pageComponents/dashboard/evaluation/dataset/IntelligentGeneration';
import { getAppDetailById } from '@/web/core/app/api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import {
  getBuiltinDimensionInfo,
  getBuiltinDimensionNameFromId,
  getBuiltinDimensionIdFromName,
  getBuiltinDimensionEnglishInfo
} from '@/web/core/evaluation/utils';
import {
  getWebDefaultEmbeddingModel,
  getWebDefaultEvaluationModel
} from '@/web/common/system/utils';

// 表单数据类型定义
export interface TaskFormData {
  name: string;
  appId: string;
  appVersion: string;
  evalDatasetCollectionId: string;
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
  evalDatasetCollectionId: '',
  selectedDimensions: []
};

const CreateModal = ({ isOpen, onClose, onSubmit }: CreateModalProps) => {
  const { t } = useTranslation();
  const [isManageDimensionOpen, setIsManageDimensionOpen] = useState(false);
  const [recommendedDimensionText, setRecommendedDimensionText] = useState('');
  const [shouldAutoExpand, setShouldAutoExpand] = useState(false);
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

  // 获取推荐维度的函数
  const getRecommendedDimensions = useCallback(
    (hasDatasetSearch: boolean, hasChatNode: boolean): Dimension[] => {
      const defaultEmbeddingModel = getWebDefaultEmbeddingModel(embeddingModelList)?.model || '';
      const defaultEvaluationModel =
        getWebDefaultEvaluationModel(llmModelList.filter((item) => item.useInEvaluation))?.model ||
        '';

      const recommendedDimensions: Dimension[] = [];

      // 生成节点指标：answer_correctness（默认选中）
      if (hasChatNode) {
        const answerCorrectnessInfo = getBuiltinDimensionInfo('answer_correctness');
        recommendedDimensions.push({
          id: getBuiltinDimensionIdFromName('answer_correctness'),
          name: answerCorrectnessInfo
            ? t(answerCorrectnessInfo.name)
            : t('dashboard_evaluation:builtin_answer_correctness_name'),
          type: 'builtin',
          description: answerCorrectnessInfo
            ? t(answerCorrectnessInfo.description)
            : t('dashboard_evaluation:builtin_answer_correctness_desc'),
          evaluationModel: defaultEvaluationModel,
          indexModel: defaultEmbeddingModel,
          llmRequired: true,
          embeddingRequired: true,
          isSelected: true
        });
      }

      // 检索节点指标：faithfulness（默认选中），context_recall（默认选中）
      if (hasDatasetSearch) {
        const faithfulnessInfo = getBuiltinDimensionInfo('faithfulness');
        recommendedDimensions.push({
          id: getBuiltinDimensionIdFromName('faithfulness'),
          name: faithfulnessInfo
            ? t(faithfulnessInfo.name)
            : t('dashboard_evaluation:builtin_faithfulness_name'),
          type: 'builtin',
          description: faithfulnessInfo
            ? t(faithfulnessInfo.description)
            : t('dashboard_evaluation:builtin_faithfulness_desc'),
          evaluationModel: defaultEvaluationModel,
          indexModel: '',
          llmRequired: true,
          embeddingRequired: false,
          isSelected: true
        });

        const contextRecallInfo = getBuiltinDimensionInfo('context_recall');
        recommendedDimensions.push({
          id: getBuiltinDimensionIdFromName('context_recall'),
          name: contextRecallInfo
            ? t(contextRecallInfo.name)
            : t('dashboard_evaluation:builtin_context_recall_name'),
          type: 'builtin',
          description: contextRecallInfo
            ? t(contextRecallInfo.description)
            : t('dashboard_evaluation:builtin_context_recall_desc'),
          evaluationModel: defaultEvaluationModel,
          indexModel: '',
          llmRequired: true,
          embeddingRequired: false,
          isSelected: true
        });
      }

      return recommendedDimensions;
    },
    [embeddingModelList, llmModelList, t]
  );

  // 获取应用最近使用的数据集
  const { runAsync: getLastUsedDataset } = useRequest2(
    async (appId: string) => {
      if (!appId) return null;
      const result = await getEvaluationList({
        pageNum: 1,
        pageSize: 1,
        appId: appId
      });
      return result.list.length > 0 ? result.list[0] : null;
    },
    {
      manual: true
    }
  );

  // 获取应用详情并分析节点类型
  const { runAsync: getAppDetail } = useRequest2(
    async (appId: string) => {
      if (!appId) return null;
      return await getAppDetailById(appId);
    },
    {
      manual: true,
      onSuccess: async (appDetail) => {
        if (!appDetail?.modules) {
          setRecommendedDimensionText('');
          // 清空推荐维度
          setValue('selectedDimensions', []);
          return;
        }

        const hasDatasetSearch = appDetail.modules.some(
          (module: any) => module.flowNodeType === FlowNodeTypeEnum.datasetSearchNode
        );
        const hasChatNode = appDetail.modules.some(
          (module: any) => module.flowNodeType === FlowNodeTypeEnum.chatNode
        );

        // 获取推荐的维度列表
        const recommendedDimensions = getRecommendedDimensions(hasDatasetSearch, hasChatNode);

        // 更新已选择的维度列表为推荐维度
        setValue('selectedDimensions', recommendedDimensions);

        if (hasDatasetSearch && hasChatNode) {
          setRecommendedDimensionText(
            t('评测应用包含知识库搜索和AI对话环节，已推荐使用 3 个维度进行评估')
          );
          setShouldAutoExpand(false);
        } else if (hasChatNode) {
          setRecommendedDimensionText(t('评测应用包含AI对话环节，已推荐使用 1 个维度进行评估'));
          setShouldAutoExpand(false);
        } else if (hasDatasetSearch) {
          setRecommendedDimensionText(t('评测应用包含知识库搜索环节，已推荐使用 2 个维度进行评估'));
          setShouldAutoExpand(false);
        } else {
          setRecommendedDimensionText('');
          setShouldAutoExpand(true);
        }

        // 获取并设置该应用最近使用的数据集
        try {
          const lastEvaluation = await getLastUsedDataset(appDetail._id);
          if (lastEvaluation?.evalDatasetCollectionId) {
            setValue('evalDatasetCollectionId', lastEvaluation.evalDatasetCollectionId);
          }
        } catch (error) {
          console.error('Failed to get last used dataset:', error);
        }
      }
    }
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
        // 对于内置维度，使用英文名称和描述
        let metricName = dimension.name;
        let metricDescription = dimension.description;

        if (dimension.type === 'builtin') {
          const dimensionName = getBuiltinDimensionNameFromId(dimension.id);
          const englishInfo = getBuiltinDimensionEnglishInfo(dimensionName);
          if (englishInfo) {
            metricName = englishInfo.name;
            metricDescription = englishInfo.description;
          }
        }

        const metric: EvalMetricSchemaType = {
          _id: dimension.id,
          teamId: '',
          tmbId: '',
          name: metricName,
          description: metricDescription,
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
        evalDatasetCollectionId: data.evalDatasetCollectionId,
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

  // 当应用版本列表加载完成后，自动选择最新版本
  React.useEffect(() => {
    if (appVersions.length > 0 && watchedValues.appId) {
      const latestVersion = appVersions[0];
      // 如果当前没有选中版本，或者当前选中的版本不在新的版本列表中，则自动选择最新版本
      const currentVersionExists = appVersions.some(
        (version) => version._id === watchedValues.appVersion
      );
      if (!watchedValues.appVersion || !currentVersionExists) {
        setValue('appVersion', latestVersion._id);
      }
    }
  }, [appVersions, watchedValues.appId, watchedValues.appVersion, setValue]);

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

  // 当需要自动展开且没有选中维度时，自动展开折叠块
  React.useEffect(() => {
    if (shouldAutoExpand && selectedDimensions.length === 0 && !isDimensionExpanded) {
      toggleDimensionExpanded();
    }
  }, [shouldAutoExpand, selectedDimensions.length, isDimensionExpanded, toggleDimensionExpanded]);

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
  const handleIntelligentGenerationConfirm = useCallback(
    (data: any, evalDatasetCollectionId?: string) => {
      onCloseIntelligentModal();
      fetchDatasets();
      // 如果返回了数据集ID，自动选择新创建的数据集
      if (evalDatasetCollectionId) {
        setValue('evalDatasetCollectionId', evalDatasetCollectionId);
      }
    },
    [onCloseIntelligentModal, fetchDatasets, setValue]
  );

  return (
    <>
      <MyModal
        iconSrc="common/resultLight"
        iconColor="blue.600"
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
                    // 获取应用详情并分析节点类型
                    getAppDetail(id);
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
                    value={watchedValues.evalDatasetCollectionId}
                    list={datasetOptions}
                    onChange={(val) => setValue('evalDatasetCollectionId', val)}
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
                      leftIcon={<MyIcon name="common/folderImport" w="14px" />}
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
                              <MyIcon name={'core/app/aiLightSmall'} w={'16px'} mr={2} />
                              {t('dashboard_evaluation:smart_generation')}
                            </Flex>
                          ),
                          onClick: () => handleCreateDataset('smart')
                        },
                        {
                          label: (
                            <Flex>
                              <MyIcon name={'core/dataset/tableCollection'} mr={2} w={'16px'} />
                              {t('dashboard_evaluation:file_import')}
                            </Flex>
                          ),
                          onClick: () => handleCreateDataset('import')
                        }
                      ]
                    }
                  ]}
                />
                <Button variant="whiteBase" size="md" flexShrink={0} onClick={fetchDatasets}>
                  <MyIcon name="common/confirm/restoreTip" w="14px" />
                </Button>
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
                    {recommendedDimensionText || ''}
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

                <Collapse in={isDimensionExpanded}>
                  {selectedDimensions.length > 0 ? (
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
                  ) : (
                    <Box bg="myGray.50" pb={4}>
                      <EmptyTip
                        py={4}
                        iconSize="48px"
                        text={
                          <Text fontSize="sm" color="myGray.500">
                            {t('还没有添加评测维度，')}
                            <Link
                              color="primary.600"
                              _hover={{ color: 'primary.700' }}
                              onClick={handleOpenManageDimension}
                            >
                              {t('点击添加')}
                            </Link>
                          </Text>
                        }
                      />
                    </Box>
                  )}
                </Collapse>
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
              !watchedValues.evalDatasetCollectionId ||
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
          returnDatasetId={true}
        />
      )}
    </>
  );
};

export default CreateModal;
