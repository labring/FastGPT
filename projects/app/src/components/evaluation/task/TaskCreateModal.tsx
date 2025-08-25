import React, { useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Textarea,
  VStack,
  HStack,
  Text,
  Divider,
  Checkbox,
  CheckboxGroup,
  SimpleGrid
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useEvaluationStore } from '@/web/core/evaluation/store/evaluation';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { createEvaluation, startEvaluation } from '@/web/core/evaluation/task';
import type {
  CreateEvaluationParams as TaskFormType,
  EvaluatorSchema,
  RuntimeConfig
} from '@fastgpt/global/core/evaluation/type';
import AppSelect from '@/components/Select/AppSelect';
import AIModelSelector from '@/components/Select/AIModelSelector';

const TaskCreateModal: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { llmModelList } = useSystemStore();

  const {
    datasets,
    metrics,
    showTaskModal,
    closeTaskModal,
    addTask,
    selectedDatasetId,
    selectedMetricIds,
    setSelectedDatasetId,
    setSelectedMetricIds
  } = useEvaluationStore();

  // 评估器配置状态
  const [evaluatorConfigs, setEvaluatorConfigs] = React.useState<Map<string, RuntimeConfig>>(
    new Map()
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors }
  } = useForm<TaskFormType>({
    defaultValues: {
      name: '',
      description: '',
      datasetId: selectedDatasetId,
      target: {
        type: 'workflow',
        config: {
          appId: '',
          chatConfig: {}
        }
      },
      evaluators: []
    }
  });

  const datasetId = watch('datasetId');
  // const evaluators = watch('evaluators') || []; // Not needed as we build evaluators dynamically
  const [selectedAppId, setSelectedAppId] = React.useState<string>('');

  // 使用useMemo避免不必要的重新计算
  const selectedMetrics = React.useMemo(
    () => metrics.filter((m) => selectedMetricIds.includes(m._id)),
    [metrics, selectedMetricIds]
  );

  useEffect(() => {
    setValue('datasetId', selectedDatasetId);
  }, [selectedDatasetId, setValue]);

  useEffect(() => {
    // 构建评估器配置
    const newEvaluators: EvaluatorSchema[] = selectedMetrics.map((metric) => ({
      metric,
      runtimeConfig: evaluatorConfigs.get(metric._id) || {}
    }));

    setValue('evaluators', newEvaluators);
  }, [selectedMetrics, evaluatorConfigs, setValue]);

  const { runAsync: createEvaluationTask, loading: isCreating } = useRequest2(
    async (data: TaskFormType) => {
      const params = {
        name: data.name,
        description: data.description,
        datasetId: data.datasetId,
        target: data.target,
        evaluators: data.evaluators
      };

      // 创建评估任务
      const evaluation = await createEvaluation(params);

      // 立即启动评估任务
      await startEvaluation(evaluation._id);

      return evaluation;
    },
    {
      onSuccess: (result) => {
        addTask(result as any);
        toast({
          title: t('dashboard_evaluation:evaluation_created_and_started'),
          status: 'success'
        });
        handleClose();
      },
      onError: (error) => {
        toast({
          title: t('dashboard_evaluation:evaluation_creation_failed'),
          description: error.message,
          status: 'error'
        });
      }
    }
  );

  const handleClose = () => {
    closeTaskModal();
    reset();
  };

  const onSubmit = async (data: TaskFormType) => {
    // Update store selections
    setSelectedDatasetId(data.datasetId);
    setSelectedMetricIds(selectedMetricIds);

    await createEvaluationTask(data);
  };

  const handleAppSelect = (appId: string) => {
    setSelectedAppId(appId);
    setValue('target', {
      type: 'workflow',
      config: {
        appId,
        chatConfig: {}
      }
    });
    setValue('target.config.appId', appId);
  };

  const selectedDataset = datasets.find((d) => d._id === datasetId);

  // 处理评估器配置更新
  const updateEvaluatorConfig = (
    metricId: string,
    configKey: keyof RuntimeConfig,
    value: string
  ) => {
    setEvaluatorConfigs((prev) => {
      const newConfigs = new Map(prev);
      const existingConfig = newConfigs.get(metricId) || {};
      newConfigs.set(metricId, { ...existingConfig, [configKey]: value });
      return newConfigs;
    });
  };

  return (
    <Modal isOpen={showTaskModal} onClose={handleClose} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t('dashboard_evaluation:create_evaluation')}</ModalHeader>
        <ModalBody pb={6}>
          <VStack spacing={6} align="stretch">
            {/* Basic Info */}
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={!!errors.name}>
                <FormLabel>{t('dashboard_evaluation:evaluation_name')}</FormLabel>
                <Input
                  {...register('name', { required: true })}
                  placeholder={t('dashboard_evaluation:Task_name_placeholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t('dashboard_evaluation:evaluation_description')}</FormLabel>
                <Textarea
                  {...register('description')}
                  placeholder={t('common:description_placeholder')}
                  rows={3}
                />
              </FormControl>
            </VStack>

            <Divider />

            {/* Dataset Selection */}
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:select_dataset')}</FormLabel>
              <SimpleGrid columns={1} spacing={2}>
                {datasets.map((dataset) => (
                  <Box
                    key={dataset._id}
                    p={3}
                    border="2px"
                    borderColor={datasetId === dataset._id ? 'primary.500' : 'gray.200'}
                    borderRadius="md"
                    cursor="pointer"
                    bg={datasetId === dataset._id ? 'primary.50' : 'white'}
                    onClick={() => setValue('datasetId', dataset._id)}
                    _hover={{ borderColor: 'primary.300' }}
                  >
                    <Text fontWeight="medium">{dataset.name}</Text>
                    <Text fontSize="sm" color="gray.600" noOfLines={1}>
                      {dataset.description}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {dataset.columns?.length || 0} columns, {dataset.dataItems?.length || 0} items
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
              {datasets.length === 0 && (
                <Text color="gray.500" textAlign="center" py={4}>
                  {t('dashboard_evaluation:no_data')}
                </Text>
              )}
            </FormControl>

            <Divider />

            {/* App Selection */}
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:select_app')}</FormLabel>
              <AppSelect value={selectedAppId} onSelect={handleAppSelect} />
            </FormControl>

            <Divider />

            {/* Metrics Selection */}
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:select_metrics')}</FormLabel>
              <CheckboxGroup
                value={selectedMetricIds}
                onChange={(values) => setSelectedMetricIds(values as string[])}
              >
                <SimpleGrid columns={1} spacing={4}>
                  {metrics.map((metric) => {
                    const isSelected = selectedMetricIds.includes(metric._id);
                    const config = evaluatorConfigs.get(metric._id) || {};

                    return (
                      <Box
                        key={metric._id}
                        border="1px"
                        borderColor={isSelected ? 'primary.500' : 'gray.200'}
                        borderRadius="md"
                        bg={isSelected ? 'primary.50' : 'white'}
                      >
                        <Checkbox value={metric._id} p={3} w="100%">
                          <Box>
                            <Text fontWeight="medium">{metric.name}</Text>
                            <Text fontSize="sm" color="gray.600" noOfLines={1}>
                              {metric.description}
                            </Text>
                            <HStack mt={1}>
                              <Text fontSize="sm" color="gray.500" fontWeight="medium">
                                {metric.type}
                              </Text>
                              {metric.dependencies && metric.dependencies.length > 0 && (
                                <Text fontSize="sm" color="blue.500">
                                  {t('dashboard_evaluation:requires')}:{' '}
                                  {metric.dependencies.join(', ')}
                                </Text>
                              )}
                            </HStack>
                          </Box>
                        </Checkbox>

                        {/* Model Configuration - only show if metric is selected */}
                        {isSelected && metric.dependencies && (
                          <Box px={3} pb={3} pt={0}>
                            <VStack spacing={3} align="stretch">
                              {metric.dependencies.includes('llm') && (
                                <FormControl size="sm">
                                  <FormLabel fontSize="sm">
                                    {t('dashboard_evaluation:llm_model')}
                                  </FormLabel>
                                  <AIModelSelector
                                    value={config.llm || ''}
                                    list={llmModelList.map((item) => ({
                                      label: item.name,
                                      value: item.model
                                    }))}
                                    onChange={(model) =>
                                      updateEvaluatorConfig(metric._id, 'llm', model)
                                    }
                                  />
                                </FormControl>
                              )}

                              {metric.dependencies.includes('embedding') && (
                                <FormControl size="sm">
                                  <FormLabel fontSize="sm">
                                    {t('dashboard_evaluation:embedding_model')}
                                  </FormLabel>
                                  <AIModelSelector
                                    value={config.embedding || ''}
                                    list={[]} // TODO: Add embedding models
                                    onChange={(model) =>
                                      updateEvaluatorConfig(metric._id, 'embedding', model)
                                    }
                                  />
                                </FormControl>
                              )}
                            </VStack>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </CheckboxGroup>
              {metrics.length === 0 && (
                <Text color="gray.500" textAlign="center" py={4}>
                  {t('dashboard_evaluation:no_data')}
                </Text>
              )}
            </FormControl>

            {/* Summary */}
            {selectedDataset && selectedAppId && selectedMetrics.length > 0 && (
              <>
                <Divider />
                <Box p={4} bg="gray.50" borderRadius="md">
                  <Text fontWeight="medium" mb={3}>
                    {t('common:summary')}
                  </Text>
                  <VStack align="stretch" spacing={2} fontSize="sm">
                    <HStack>
                      <Text minW="100px" color="gray.600">
                        {t('dashboard_evaluation:datasets')}:
                      </Text>
                      <Text>{selectedDataset.name}</Text>
                    </HStack>
                    <HStack>
                      <Text minW="100px" color="gray.600">
                        {t('dashboard_evaluation:app')}:
                      </Text>
                      <Text>{selectedAppId}</Text>
                    </HStack>
                    <HStack align="start">
                      <Text minW="100px" color="gray.600">
                        {t('dashboard_evaluation:metrics')}:
                      </Text>
                      <VStack align="start" spacing={1}>
                        {selectedMetrics.map((metric) => {
                          const config = evaluatorConfigs.get(metric._id) || {};
                          return (
                            <Box key={metric._id}>
                              <Text>{metric.name}</Text>
                              {metric.dependencies && metric.dependencies.length > 0 && (
                                <Text fontSize="xs" color="gray.500">
                                  {metric.dependencies
                                    .map((dep) =>
                                      dep === 'llm' && config.llm
                                        ? `${dep}: ${config.llm}`
                                        : dep === 'embedding' && config.embedding
                                          ? `${dep}: ${config.embedding}`
                                          : `${dep}: ${t('dashboard_evaluation:not_configured')}`
                                    )
                                    .join(', ')}
                                </Text>
                              )}
                            </Box>
                          );
                        })}
                      </VStack>
                    </HStack>
                  </VStack>
                </Box>
              </>
            )}

            {/* Actions */}
            <HStack justify="flex-end" pt={4}>
              <Button variant="ghost" onClick={handleClose}>
                {t('common:cancel')}
              </Button>
              <Button
                onClick={handleSubmit(onSubmit)}
                isLoading={isCreating}
                isDisabled={
                  !datasetId ||
                  !selectedAppId ||
                  selectedMetricIds.length === 0 ||
                  !watch('name')?.trim()
                }
              >
                {t('dashboard_evaluation:create_and_start_evaluation')}
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default TaskCreateModal;
