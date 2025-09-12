import React, { useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  HStack,
  ModalBody,
  ModalFooter,
  Text,
  VStack
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemo } from 'react';
import { getMetricList } from '@/web/core/evaluation/dimension';
import type { EvalMetricDisplayType } from '@fastgpt/global/core/evaluation/metric/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import {
  getWebDefaultEmbeddingModel,
  getWebDefaultEvaluationModel
} from '@/web/common/system/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

// 维度类型定义
export interface Dimension {
  id: string;
  name: string;
  type: 'builtin' | 'custom';
  description: string;
  evaluationModel: string; // 评测模型 (对应 llmRequired)
  indexModel?: string; // 索引模型 (对应 embeddingRequired)
  llmRequired: boolean; // 是否需要评测模型
  embeddingRequired: boolean; // 是否需要索引模型
  isSelected: boolean;
}

interface ManageDimensionProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDimensions: Dimension[];
  onConfirm: (dimensions: Dimension[]) => void;
}

// 转换 API 数据为组件所需格式
const transformMetricToDimension = (
  metric: EvalMetricDisplayType,
  defaultEmbeddingModel?: string,
  defaultEvaluationModel?: string
): Dimension => {
  return {
    id: metric._id,
    name: metric.name,
    type: metric.type === 'builtin_metric' ? 'builtin' : 'custom',
    description: metric.description || '',
    evaluationModel: metric.llmRequired ? defaultEvaluationModel || '' : '', // 使用默认评估模型
    indexModel: metric.embeddingRequired ? defaultEmbeddingModel || '' : undefined, // 如果不需要索引模型则为 undefined
    llmRequired: metric.llmRequired,
    embeddingRequired: metric.embeddingRequired,
    isSelected: false
  };
};

// 维度项组件
const DimensionItem = ({
  dimension,
  isSelected,
  onToggle,
  onModelChange,
  evalModelList,
  filterNotHiddenVectorModelList,
  isDisabled
}: {
  dimension: Dimension;
  isSelected: boolean;
  onToggle: (dimension: Dimension, checked: boolean) => void;
  onModelChange: (
    dimensionId: string,
    field: 'evaluationModel' | 'indexModel',
    value: string
  ) => void;
  evalModelList: any[];
  filterNotHiddenVectorModelList: any[];
  isDisabled?: boolean;
}) => {
  const { t } = useTranslation();

  return (
    <Box
      p={4}
      border="1px solid"
      borderColor={isSelected ? 'primary.500' : 'myGray.200'}
      borderRadius="md"
      bg={isSelected ? 'primary.50' : isDisabled ? 'myGray.50' : 'white'}
      mb={3}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      opacity={isDisabled ? 0.6 : 1}
      _hover={{
        borderColor: isDisabled ? 'myGray.200' : isSelected ? 'primary.600' : 'myGray.300'
      }}
      onClick={() => !isDisabled && onToggle(dimension, !isSelected)}
    >
      <HStack align="center" spacing={3} mb={3}>
        <Checkbox
          isChecked={isSelected}
          isDisabled={isDisabled}
          onChange={(e) => {
            e.stopPropagation();
            if (!isDisabled) {
              onToggle(dimension, e.target.checked);
            }
          }}
        />
        <VStack align="flex-start" flex={1} spacing={1}>
          <HStack>
            <Text fontWeight="medium" fontSize="sm">
              {dimension.name}
            </Text>
            {dimension.type === 'builtin' && (
              <MyTag colorSchema="gray">{t('dashboard_evaluation:builtin')}</MyTag>
            )}
          </HStack>
          <Text fontSize="xs" color="myGray.600">
            {dimension.description || '-'}
          </Text>
        </VStack>
      </HStack>

      <HStack spacing={2} w="full" px={8}>
        {/* 评测模型选择器 */}
        {dimension.llmRequired && (
          <AIModelSelector
            w="300px"
            h={7}
            bg={isDisabled ? 'myGray.100' : 'white'}
            value={dimension.evaluationModel}
            list={evalModelList.map((item) => ({
              label: item.name,
              value: item.model
            }))}
            onChange={(e) => {
              if (!isDisabled) {
                onModelChange(dimension.id, 'evaluationModel', e);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            disableTip={
              isDisabled ? t('dashboard_evaluation:please_select_dimension_first') : undefined
            }
          />
        )}

        {/* 索引模型选择器 */}
        {dimension.embeddingRequired && (
          <AIModelSelector
            w="300px"
            h={7}
            bg={isDisabled ? 'myGray.100' : 'white'}
            value={dimension.indexModel || ''}
            list={filterNotHiddenVectorModelList.map((item) => ({
              label: item.name,
              value: item.model
            }))}
            onChange={(e) => {
              if (!isDisabled) {
                onModelChange(dimension.id, 'indexModel', e);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            disableTip={
              isDisabled ? t('dashboard_evaluation:please_select_dimension_first') : undefined
            }
          />
        )}

        {/* 只有两种模型都需要的卡片才显示questionTip */}
        {dimension.llmRequired && dimension.embeddingRequired && (
          <Box onClick={(e) => e.stopPropagation()}>
            <QuestionTip label={t('dashboard_evaluation:model_evaluation_tip')} />
          </Box>
        )}
      </HStack>
    </Box>
  );
};

const ManageDimension = ({
  isOpen,
  onClose,
  selectedDimensions,
  onConfirm
}: ManageDimensionProps) => {
  const { t } = useTranslation();
  const { llmModelList, embeddingModelList } = useSystemStore();

  // 最大选择数量限制
  const MAX_SELECTION_COUNT = 10;

  const evalModelList = useMemo(() => {
    return llmModelList.filter((item) => item.useInEvaluation);
  }, [llmModelList]);

  const filterNotHiddenVectorModelList = useMemo(() => {
    return embeddingModelList.filter((item) => !item.hidden);
  }, [embeddingModelList]);

  const { control, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      dimensions: [] as Dimension[]
    }
  });

  const { fields, replace } = useFieldArray({
    control,
    name: 'dimensions'
  });

  const watchedDimensions = watch('dimensions');

  // 空状态提示组件
  const EmptyTipDom = useMemo(
    () => <EmptyTip text={t('dashboard_evaluation:no_dimension_data')} />,
    [t]
  );

  // API 适配器函数 - 转换参数格式
  const getMetricListAdapter = useCallback(
    async (data: PaginationProps): Promise<PaginationResponse<EvalMetricDisplayType>> => {
      return getMetricList({
        pageNum: Math.floor(Number(data.offset) / Number(data.pageSize)) + 1,
        pageSize: Number(data.pageSize),
        searchKey: ''
      });
    },
    []
  );

  // 获取维度列表 - 使用滚动分页
  const {
    data: metricList,
    ScrollData,
    refreshList
  } = useScrollPagination(getMetricListAdapter, {
    pageSize: 10,
    params: {},
    refreshDeps: [isOpen],
    EmptyTip: EmptyTipDom,
    disabled: !isOpen
  });

  // 转换并合并维度数据
  const transformedDimensions = useMemo(() => {
    if (!metricList.length) return [];

    const defaultEmbeddingModel = getWebDefaultEmbeddingModel(embeddingModelList)?.model;
    const defaultEvaluationModel = getWebDefaultEvaluationModel(evalModelList)?.model;

    return metricList.map((metric) => {
      const dimension = transformMetricToDimension(
        metric,
        defaultEmbeddingModel,
        defaultEvaluationModel
      );
      const selectedDimension = selectedDimensions.find((s) => s.id === dimension.id);

      if (selectedDimension) {
        // 如果在选中列表中，保持选中状态并使用已配置的模型
        return {
          ...dimension,
          evaluationModel: selectedDimension.evaluationModel || dimension.evaluationModel,
          indexModel: selectedDimension.indexModel || dimension.indexModel,
          isSelected: true
        };
      }
      return dimension;
    });
  }, [metricList, selectedDimensions, embeddingModelList, evalModelList]);

  // 同步转换后的维度数据到表单，保持已有的选择状态
  useEffect(() => {
    if (transformedDimensions.length > 0) {
      const currentDimensions = watchedDimensions;

      // 如果当前表单为空，直接设置转换后的数据
      if (currentDimensions.length === 0) {
        replace(transformedDimensions);
        return;
      }

      // 合并新数据和已有数据，保持已有的选择状态
      const mergedDimensions = transformedDimensions.map((newDimension) => {
        const existingDimension = currentDimensions.find((d) => d.id === newDimension.id);

        if (existingDimension) {
          // 如果维度已存在，保持其当前状态（选择状态和模型配置）
          return existingDimension;
        }

        // 新维度，使用转换后的默认状态
        return newDimension;
      });

      // 添加新加载的维度（在滚动加载时）
      const existingIds = currentDimensions.map((d) => d.id);
      const newDimensions = transformedDimensions.filter((d) => !existingIds.includes(d.id));

      if (newDimensions.length > 0) {
        // 有新维度，追加到现有列表
        const finalDimensions = [...currentDimensions, ...newDimensions];
        replace(finalDimensions);
      } else if (mergedDimensions.length !== currentDimensions.length) {
        // 维度数量发生变化，更新列表
        replace(mergedDimensions);
      }
    }
  }, [transformedDimensions, replace, watchedDimensions]);

  // 处理维度选择
  const handleDimensionToggle = useCallback(
    (dimension: Dimension, checked: boolean) => {
      const currentDimensions = watchedDimensions;
      const currentSelectedCount = currentDimensions.filter((d) => d.isSelected).length;

      // 如果要选中且已达到最大限制，则不允许选中
      if (checked && currentSelectedCount >= MAX_SELECTION_COUNT) {
        return;
      }

      const updatedDimensions = currentDimensions.map((d) =>
        d.id === dimension.id ? { ...d, isSelected: checked } : d
      );
      replace(updatedDimensions);
    },
    [watchedDimensions, replace]
  );

  // 处理模型变更
  const handleModelChange = useCallback(
    (dimensionId: string, field: 'evaluationModel' | 'indexModel', value: string) => {
      const currentDimensions = watchedDimensions;
      const updatedDimensions = currentDimensions.map((d) =>
        d.id === dimensionId ? { ...d, [field]: value } : d
      );
      replace(updatedDimensions);
    },
    [watchedDimensions, replace]
  );

  // 刷新维度列表
  const handleRefresh = useCallback(() => {
    refreshList();
  }, [refreshList]);

  // 新建维度
  const handleCreateDimension = useCallback(() => {
    // TODO:
    window.open('/dashboard/evaluation/dimension/create', '_blank');
  }, []);

  // 确认选择
  const handleConfirm = useCallback(() => {
    const selectedDims = watchedDimensions.filter((d) => d.isSelected);
    onConfirm(selectedDims);
    onClose();
  }, [watchedDimensions, onConfirm, onClose]);

  // 计算真实的选中数量：包括表单中的选中维度和传入的已选维度（可能还未加载到表单中）
  const selectedCount = useMemo(() => {
    const formSelectedIds = watchedDimensions.filter((d) => d.isSelected).map((d) => d.id);
    const propsSelectedIds = selectedDimensions.map((d) => d.id);

    // 合并两个数组并去重，得到真实的选中维度数量
    const allSelectedIds = new Set([...formSelectedIds, ...propsSelectedIds]);
    return allSelectedIds.size;
  }, [watchedDimensions, selectedDimensions]);

  const isMaxSelected = selectedCount >= MAX_SELECTION_COUNT;

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="modal/edit"
      title={t('dashboard_evaluation:manage_dimension')}
      w="100%"
      maxW={['90vw', '800px']}
      h="100%"
      maxH="90vh"
      isCentered
      overflow="hidden"
    >
      <ModalBody flex={1} p={0} display="flex" flexDirection="column">
        <Box p={6} pb={4}>
          <Flex justify="space-between" align="center">
            <Text fontSize="sm" color="myGray.600">
              {t('dashboard_evaluation:selected_count')} {selectedCount}/{MAX_SELECTION_COUNT}
            </Text>
            <HStack spacing={2}>
              <Button variant="whiteBase" size="md" onClick={handleCreateDimension}>
                {t('dashboard_evaluation:create_new_dimension')}
              </Button>
              <Button variant="whiteBase" size="md" onClick={handleRefresh}>
                <MyIcon name="common/refreshLight" w="14px" />
              </Button>
            </HStack>
          </Flex>
        </Box>

        <ScrollData flex={1} px={6}>
          {fields.map((field, index) => {
            const dimension = watchedDimensions[index];
            const isSelected = dimension?.isSelected || false;
            const isDisabled = !isSelected && isMaxSelected;

            return (
              <DimensionItem
                key={field.id}
                dimension={dimension}
                isSelected={isSelected}
                onToggle={handleDimensionToggle}
                onModelChange={handleModelChange}
                evalModelList={evalModelList}
                filterNotHiddenVectorModelList={filterNotHiddenVectorModelList}
                isDisabled={isDisabled}
              />
            );
          })}
        </ScrollData>
      </ModalBody>

      <ModalFooter>
        <Button variant="whiteBase" mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button variant="primary" onClick={handleConfirm} isDisabled={selectedCount === 0}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ManageDimension;
