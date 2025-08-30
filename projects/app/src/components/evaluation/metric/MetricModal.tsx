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
  Select,
  Textarea,
  VStack,
  HStack,
  Text,
  Divider,
  Code,
  Checkbox,
  CheckboxGroup
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useEvaluationStore } from '@/web/core/evaluation/store/evaluation';
import { createMetric, updateMetric } from '@/web/core/evaluation/metric';
import AIModelSelector from '@/components/Select/AIModelSelector';
import type {
  AiModelConfig,
  CreateMetricParams,
  MetricDependency,
  EvaluationMetricSchemaType
} from '@fastgpt/global/core/evaluation/type';

const MetricModal: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { llmModelList } = useSystemStore();

  const {
    showMetricModal,
    editingItem,
    closeMetricModal,
    addMetric,
    updateMetric: updateMetricInStore
  } = useEvaluationStore();

  const isEdit = !!editingItem;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<CreateMetricParams>({
    defaultValues: {
      name: '',
      type: 'ai_model',
      description: '',
      dependencies: [],
      config: {}
    }
  });

  const metricType = watch('type');
  const dependencies = watch('dependencies') || [];

  useEffect(() => {
    if (
      editingItem &&
      'type' in editingItem &&
      'config' in editingItem &&
      editingItem.type === 'ai_model'
    ) {
      reset({
        name: editingItem.name,
        type: editingItem.type,
        description: editingItem.description || '',
        dependencies: editingItem.dependencies || [],
        config: editingItem.config as AiModelConfig
      });
    } else {
      reset({
        name: '',
        type: 'ai_model',
        description: '',
        dependencies: [],
        config: {}
      });
    }
  }, [editingItem, reset]);

  const { runAsync: saveMetric, loading: isSaving } = useRequest2(
    async (data: CreateMetricParams) => {
      if (isEdit) {
        await updateMetric({ metricId: editingItem._id, ...data });
        return { ...editingItem, ...data } as EvaluationMetricSchemaType;
      } else {
        return await createMetric(data);
      }
    },
    {
      onSuccess: (result) => {
        if (isEdit) {
          updateMetricInStore(editingItem._id, result);
          toast({
            title: t('dashboard_evaluation:metric_updated'),
            status: 'success'
          });
        } else {
          addMetric(result);
          toast({
            title: t('dashboard_evaluation:metric_created'),
            status: 'success'
          });
        }
        handleClose();
      }
    }
  );

  const handleClose = () => {
    closeMetricModal();
    reset();
  };

  const onSubmit = async (data: CreateMetricParams) => {
    await saveMetric(data);
  };

  const renderConfigForm = () => {
    switch (metricType) {
      case 'ai_model':
        return (
          <VStack spacing={4} align="stretch">
            {/* Dependencies Selection */}
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:metric_dependencies')}</FormLabel>
              <CheckboxGroup
                value={dependencies}
                onChange={(values) => setValue('dependencies', values as MetricDependency[])}
              >
                <HStack spacing={4}>
                  <Checkbox value="llm">{t('dashboard_evaluation:requires_llm')}</Checkbox>
                  <Checkbox value="embedding">
                    {t('dashboard_evaluation:requires_embedding')}
                  </Checkbox>
                </HStack>
              </CheckboxGroup>
              <Text fontSize="sm" color="gray.500" mt={1}>
                {t('dashboard_evaluation:dependencies_help')}
              </Text>
            </FormControl>

            {/* LLM Model Selection - only if dependencies includes 'llm' */}
            {dependencies.includes('llm') && (
              <FormControl>
                <FormLabel>{t('dashboard_evaluation:default_llm_model')}</FormLabel>
                <AIModelSelector
                  value={(watch('config') as AiModelConfig)?.llm || ''}
                  list={llmModelList.map((item) => ({
                    label: item.name,
                    value: item.model
                  }))}
                  onChange={(llm) => {
                    setValue('config', {
                      ...(watch('config') as AiModelConfig),
                      llm
                    });
                  }}
                />
                <Text fontSize="sm" color="gray.500" mt={1}>
                  {t('dashboard_evaluation:default_model_help')}
                </Text>
              </FormControl>
            )}

            <FormControl>
              <FormLabel>{t('dashboard_evaluation:evaluation_prompt')}</FormLabel>
              <Textarea
                {...register('config.prompt')}
                placeholder={`Please evaluate the quality of the following response:

Question: {{userInput}}
Expected Answer: {{expectedOutput}}
Actual Answer: {{actualOutput}}

Please provide a score from 0 to 1 based on accuracy and relevance.`}
                rows={8}
              />
              <Text fontSize="sm" color="gray.500" mt={1}>
                {t('common:support_variables')}: <Code>{'{{userInput}}'}</Code>,{' '}
                <Code>{'{{expectedOutput}}'}</Code>, <Code>{'{{actualOutput}}'}</Code>
              </Text>
            </FormControl>
          </VStack>
        );

      default:
        return null;
    }
  };

  return (
    <Modal isOpen={showMetricModal} onClose={handleClose} size="2xl">
      <ModalOverlay />
      <ModalContent maxH="90vh">
        <ModalHeader>
          {isEdit ? t('dashboard_evaluation:edit_metric') : t('dashboard_evaluation:create_metric')}
        </ModalHeader>
        <ModalBody pb={6} overflowY="auto">
          <VStack spacing={6} align="stretch">
            {/* Basic Info */}
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={!!errors.name}>
                <FormLabel>{t('dashboard_evaluation:metric_name')}</FormLabel>
                <Input
                  {...register('name', { required: true })}
                  placeholder={t('common:name_placeholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t('dashboard_evaluation:metric_type')}</FormLabel>
                <Select {...register('type')}>
                  <option value="ai_model">{t('dashboard_evaluation:ai_model_metric')}</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>{t('common:description')}</FormLabel>
                <Textarea
                  {...register('description')}
                  placeholder={t('common:description_placeholder')}
                  rows={3}
                />
              </FormControl>
            </VStack>

            <Divider />

            {/* Metric Configuration */}
            <Box>
              <Text fontSize="md" fontWeight="medium" mb={4}>
                {t('dashboard_evaluation:metric_config')}
              </Text>
              {renderConfigForm()}
            </Box>

            {/* Actions */}
            <HStack justify="flex-end" pt={4}>
              <Button variant="ghost" onClick={handleClose}>
                {t('common:cancel')}
              </Button>
              <Button onClick={handleSubmit(onSubmit)} isLoading={isSaving} isDisabled={!isValid}>
                {t('common:save')}
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default MetricModal;
