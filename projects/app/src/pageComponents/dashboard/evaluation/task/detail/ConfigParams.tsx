import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
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

// 分数聚合方式枚举
enum ScoreAggregationType {
  Average = 'average',
  Median = 'median'
}

// 评测维度类型
interface EvaluationDimension {
  id: string;
  name: string;
  description: string; // 维度描述
  threshold: number;
  weight: number;
}

// 表单数据类型
interface ConfigParamsForm {
  aggregationType: ScoreAggregationType;
  dimensions: EvaluationDimension[];
}

// TODO: 临时mock数据，待外部传入dimensions时移除
const mockDimensions: EvaluationDimension[] = [
  {
    id: '1',
    name: '回答准确度',
    description: '评估回答内容的准确性和事实正确性',
    threshold: 80,
    weight: 30
  },
  {
    id: '2',
    name: '问题相关度',
    description: '评估回答与问题的相关程度',
    threshold: 80,
    weight: 15
  },
  {
    id: '3',
    name: '回答创意性',
    description: '评估回答的创新性和独特性',
    threshold: 80,
    weight: 10
  },
  {
    id: '4',
    name: '回答清晰度',
    description: '评估回答的表达清晰度和可理解性',
    threshold: 70,
    weight: 10
  },
  {
    id: '5',
    name: '回答完整性',
    description: '评估回答是否全面覆盖了问题的各个方面',
    threshold: 75,
    weight: 10
  },
  {
    id: '6',
    name: '语言流畅度',
    description: '评估回答的语言表达流畅程度',
    threshold: 70,
    weight: 5
  },
  {
    id: '7',
    name: '逻辑连贯性',
    description: '评估回答的逻辑结构和连贯性',
    threshold: 75,
    weight: 5
  },
  {
    id: '8',
    name: '专业术语使用',
    description: '评估回答中专业术语使用的准确性和适当性',
    threshold: 65,
    weight: 5
  },
  {
    id: '9',
    name: '回答时效性',
    description: '评估回答内容的时效性和最新程度',
    threshold: 60,
    weight: 5
  },
  {
    id: '10',
    name: '回答友好度',
    description: '评估回答的语气和表达是否友好、易于接受',
    threshold: 70,
    weight: 5
  }
];

// 默认表单数据
const defaultForm: ConfigParamsForm = {
  aggregationType: ScoreAggregationType.Average,
  dimensions: mockDimensions
};

// 分数聚合方式选项
const aggregationOptions = [
  { value: ScoreAggregationType.Average, label: '平均值' },
  { value: ScoreAggregationType.Median, label: '中位数' }
];

const ConfigParamsModal = ({
  isOpen,
  onClose,
  onConfirm,
  defaultData = defaultForm,
  dimensions // 外部传入的评测维度数据
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ConfigParamsForm) => void;
  defaultData?: ConfigParamsForm;
  dimensions?: EvaluationDimension[]; // 可选的外部维度数据
}) => {
  const { t } = useTranslation();

  // 使用外部传入的dimensions或默认数据
  const formDefaultValues = useMemo(() => {
    return {
      ...defaultData,
      dimensions: dimensions || defaultData.dimensions
    };
  }, [defaultData, dimensions]);

  const { control, handleSubmit, watch, setValue } = useForm<ConfigParamsForm>({
    defaultValues: formDefaultValues
  });

  const watchedDimensions = watch('dimensions');

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

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="modal/setting"
      title={t('dashboard_evaluation:config_params')}
      w={'100%'}
      maxW={['90vw', '800px']}
      isCentered
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
              name="aggregationType"
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
                    <Tr key={dimension.id}>
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
          onClick={handleSubmit((data) => {
            onConfirm(data);
            onClose();
          })}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ConfigParamsModal;
