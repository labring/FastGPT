import React, { useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  ModalFooter,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  VStack
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm, Controller } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getSummaryConfigDetail, postUpdateSummaryConfig } from '@/web/core/evaluation/task';
import { CalculateMethodEnum, CaculateMethodMap } from '@fastgpt/global/core/evaluation/constants';
import { getBuiltinDimensionInfo } from '@/web/core/evaluation/utils';
import type {
  UpdateSummaryConfigBody,
  UpdateMetricConfigItem
} from '@fastgpt/global/core/evaluation/summary/api';

interface EvaluationDimension {
  metricId: string;
  name: string;
  description: string;
  threshold: number;
  weight: number;
}

interface ConfigParamsForm {
  calculateType: CalculateMethodEnum;
  dimensions: EvaluationDimension[];
}

const ConfigParamsModal = ({
  isOpen,
  onClose,
  onConfirm,
  evalTaskId
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  evalTaskId: string;
}) => {
  const { t } = useTranslation();

  // 分数聚合方式选项
  const aggregationOptions = useMemo(
    () => [
      {
        value: CalculateMethodEnum.mean,
        label: t(CaculateMethodMap[CalculateMethodEnum.mean].name)
      },
      {
        value: CalculateMethodEnum.median,
        label: t(CaculateMethodMap[CalculateMethodEnum.median].name)
      }
    ],
    [t]
  );

  const { control, handleSubmit, watch, setValue, reset } = useForm<ConfigParamsForm>({
    defaultValues: {
      calculateType: CalculateMethodEnum.mean,
      dimensions: []
    }
  });

  const watchedDimensions = watch('dimensions');

  // 加载配置数据
  const { run: loadConfigData, loading: loadingData } = useRequest2(
    async () => {
      if (!evalTaskId) return;

      const configData = await getSummaryConfigDetail(evalTaskId);

      // 转换数据格式
      const dimensions: EvaluationDimension[] = configData.metricsConfig.map((metric) => {
        // 优先使用内置维度的国际化名称和描述
        const builtinInfo = getBuiltinDimensionInfo(metric.metricName);
        const displayName = builtinInfo ? t(builtinInfo.name) : metric.metricName;
        const description = builtinInfo ? t(builtinInfo.description) : metric.metricDescription;

        return {
          metricId: metric.metricId,
          name: displayName,
          description: description,
          threshold: (metric.thresholdValue || 0.8) * 100, // 阈值乘以100转换为百分比显示
          weight: metric.weight
        };
      });

      // 重置表单数据
      reset({
        calculateType: configData.calculateType,
        dimensions
      });
    },
    {
      errorToast: t('common:load_failed')
    }
  );

  // 弹窗打开时加载数据
  useEffect(() => {
    if (isOpen) {
      loadConfigData();
    }
  }, [isOpen, loadConfigData]);

  // 计算综合评分权重总和
  const totalWeight = useMemo(() => {
    return watchedDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  }, [watchedDimensions]);

  // 判断权重是否等于100%
  const isWeightValid = totalWeight === 100;

  // 判断是否显示综合评分权重列（当维度数量大于等于3时显示）
  const showWeightColumn = watchedDimensions.length >= 3;

  // 处理阈值输入
  const handleThresholdChange = useCallback(
    (index: number, value: string) => {
      const numValue = parseInt(value) || 0;
      const clampedValue = Math.max(1, Math.min(100, numValue));

      const newDimensions = [...watchedDimensions];
      newDimensions[index] = { ...newDimensions[index], threshold: clampedValue };
      setValue('dimensions', newDimensions);
    },
    [watchedDimensions, setValue]
  );

  // 处理权重输入
  const handleWeightChange = useCallback(
    (index: number, value: number) => {
      // 转换为整数
      const intValue = Math.round(value);
      const clampedValue = Math.max(1, Math.min(100, intValue));

      const newDimensions = [...watchedDimensions];
      newDimensions[index] = { ...newDimensions[index], weight: clampedValue };
      setValue('dimensions', newDimensions);
    },
    [watchedDimensions, setValue]
  );

  // 处理权重输入失焦事件，确保值在有效范围内
  const handleWeightBlur = useCallback(
    (index: number, value: number) => {
      let finalValue = Math.round(value);

      // 如果超出范围，修正为最近的有效值
      if (finalValue < 1) finalValue = 1;
      if (finalValue > 100) finalValue = 100;

      const newDimensions = [...watchedDimensions];
      newDimensions[index] = { ...newDimensions[index], weight: finalValue };
      setValue('dimensions', newDimensions);
    },
    [watchedDimensions, setValue]
  );

  // 处理键盘上下键事件
  const handleWeightKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentValue = watchedDimensions[index].weight;
        const increment = e.key === 'ArrowUp' ? 5 : -5;
        const newValue = Math.max(1, Math.min(100, currentValue + increment));

        const newDimensions = [...watchedDimensions];
        newDimensions[index] = { ...newDimensions[index], weight: newValue };
        setValue('dimensions', newDimensions);
      }
    },
    [watchedDimensions, setValue]
  );

  // 处理表单提交
  const { run: handleFormSubmit, loading: submitting } = useRequest2(
    async (data: ConfigParamsForm) => {
      // 转换数据格式
      const metricsConfig: UpdateMetricConfigItem[] = data.dimensions.map((dimension) => ({
        metricId: dimension.metricId,
        thresholdValue: dimension.threshold / 100, // 阈值除以100转换为0-1范围
        weight: dimension.weight
      }));

      const updateData: UpdateSummaryConfigBody = {
        evalId: evalTaskId,
        calculateType: data.calculateType,
        metricsConfig
      };

      await postUpdateSummaryConfig(updateData);
    },
    {
      successToast: t('common:save_success'),
      errorToast: t('common:save_failed'),
      onSuccess: () => {
        onConfirm?.();
        onClose();
      }
    }
  );

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="modal/setting"
      title={t('dashboard_evaluation:config_params')}
      w={'100%'}
      maxW={['90vw', '800px']}
      isCentered
      isLoading={loadingData}
    >
      <ModalBody>
        <VStack spacing={6} align="stretch">
          {/* 分数聚合方式 */}
          <Box>
            <FormLabel required mb={2}>
              <Flex alignItems="center">
                {t('dashboard_evaluation:score_aggregation_method')}
                <QuestionTip
                  label={t('dashboard_evaluation:score_aggregation_method_tip')}
                  ml={1}
                />
              </Flex>
            </FormLabel>
            <Controller
              name="calculateType"
              control={control}
              render={({ field }) => (
                <MySelect
                  {...field}
                  bg="myGray.50"
                  list={aggregationOptions}
                  valueLabel={
                    aggregationOptions.find((opt) => opt.value === field.value)?.label || ''
                  }
                  onChange={(value) => field.onChange(value)}
                />
              )}
            />
          </Box>

          {/* 评测维度 */}
          <Box>
            <FormLabel required mb={3}>
              {t('dashboard_evaluation:evaluation_dimensions')}
            </FormLabel>

            <TableContainer>
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('dashboard_evaluation:dimension')}</Th>
                    <Th>
                      <Flex alignItems="center" justifyContent="center">
                        {t('dashboard_evaluation:judgment_threshold')}
                        <QuestionTip
                          label={t('dashboard_evaluation:judgment_threshold_tip')}
                          ml={1}
                        />
                      </Flex>
                    </Th>
                    {showWeightColumn && (
                      <Th>
                        <Flex alignItems="center" justifyContent="center">
                          {t('dashboard_evaluation:comprehensive_score_weight')}
                          <QuestionTip
                            label={t('dashboard_evaluation:comprehensive_score_weight_tip')}
                            ml={1}
                          />
                        </Flex>
                      </Th>
                    )}
                  </Tr>
                </Thead>
                <Tbody>
                  {watchedDimensions.map((dimension, index) => (
                    <Tr key={dimension.metricId}>
                      <Td>
                        <Flex alignItems="center">
                          <Text fontWeight="500" color="myGray.900" fontSize="14px">
                            {dimension.name}
                          </Text>
                          <QuestionTip label={dimension.description} ml={1} />
                        </Flex>
                      </Td>
                      <Td>
                        <Flex justifyContent="center">
                          <MyNumberInput
                            value={dimension.threshold}
                            onChange={(value) =>
                              handleThresholdChange(index, value?.toString() || '')
                            }
                            min={1}
                            max={100}
                            precision={0}
                            step={1}
                            bg="myGray.50"
                            textAlign="center"
                            w="80px"
                            h="32px"
                            inputFieldProps={{
                              textAlign: 'center',
                              onKeyPress: (e: React.KeyboardEvent) => {
                                if (
                                  !/[0-9]/.test(e.key) &&
                                  ![
                                    'Backspace',
                                    'Delete',
                                    'Tab',
                                    'Enter',
                                    'ArrowLeft',
                                    'ArrowRight',
                                    'ArrowUp',
                                    'ArrowDown'
                                  ].includes(e.key)
                                ) {
                                  e.preventDefault();
                                }
                              }
                            }}
                          />
                        </Flex>
                      </Td>
                      {showWeightColumn && (
                        <Td>
                          <Flex justifyContent="center" alignItems="center">
                            <MyNumberInput
                              value={dimension.weight}
                              onChange={(value) => handleWeightChange(index, value || 0)}
                              onBlur={() => handleWeightBlur(index, dimension.weight)}
                              min={1}
                              max={100}
                              precision={0}
                              step={5}
                              bg="myGray.50"
                              w="80px"
                              h="32px"
                              inputFieldProps={{
                                textAlign: 'center',
                                onKeyDown: (e) => handleWeightKeyDown(e, index),
                                onKeyPress: (e: React.KeyboardEvent) => {
                                  if (
                                    !/[0-9]/.test(e.key) &&
                                    ![
                                      'Backspace',
                                      'Delete',
                                      'Tab',
                                      'Enter',
                                      'ArrowLeft',
                                      'ArrowRight',
                                      'ArrowUp',
                                      'ArrowDown'
                                    ].includes(e.key)
                                  ) {
                                    e.preventDefault();
                                  }
                                }
                              }}
                            />
                            <Text ml={1}>%</Text>
                          </Flex>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        </VStack>
      </ModalBody>

      <ModalFooter>
        {showWeightColumn && (
          <Text fontSize="sm" color="myGray.600" fontWeight="500" mr={4}>
            {t('dashboard_evaluation:comprehensive_score_weight_sum')}{' '}
            <Text as="span" color={isWeightValid ? 'myGray.600' : 'red.500'}>
              {totalWeight}%
            </Text>
          </Text>
        )}
        <Button variant="whiteBase" mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          variant="primary"
          isDisabled={showWeightColumn ? !isWeightValid : false}
          isLoading={submitting}
          onClick={handleSubmit((data) => handleFormSubmit(data))}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ConfigParamsModal;
