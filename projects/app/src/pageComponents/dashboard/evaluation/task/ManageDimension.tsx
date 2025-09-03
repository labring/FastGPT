import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  HStack,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  Text,
  VStack,
  useDisclosure
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemo } from 'react';

// 维度类型定义
export interface Dimension {
  id: string;
  name: string;
  type: 'builtin' | 'custom';
  description: string;
  defaultModel: string;
  secondaryModel?: string;
  isSelected: boolean;
}

interface ManageDimensionProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDimensions: Dimension[];
  onConfirm: (dimensions: Dimension[]) => void;
}

// Mock 数据和函数
const mockDimensions: Dimension[] = [
  {
    id: '1',
    name: '回答准确度',
    type: 'builtin',
    description:
      '对比实际回答和参考答案，判断答案是否正确，如答案为"8848米"，回答"8000米"则准确度低。',
    defaultModel: 'DeepSeek-R1-Distill-Qwen-32B',
    secondaryModel: 'bge-3',
    isSelected: true
  },
  {
    id: '2',
    name: '语义相似度',
    type: 'builtin',
    description:
      '对比实际回答和参考答案，判断语义是否匹配，如答案为"珠穆朗玛峰登难度高"，回答"珠穆朗玛峰最高"则相似度低。',
    defaultModel: 'DeepSeek-R1-Distill-Qwen-32B',
    secondaryModel: undefined,
    isSelected: false
  },
  {
    id: '3',
    name: '问题相关度',
    type: 'builtin',
    description:
      '判断实际回答和问题之间的相关程度，是否答非所问，如提问"世界最高峰是哪个"，回答登山注意事项，则相关度低。',
    defaultModel: 'DeepSeek-R1-Distill-Qwen-32B',
    secondaryModel: undefined,
    isSelected: false
  }
];

// TODO: 替换为真实的模型选项获取 hook
const mockModelOptions = [
  { label: 'DeepSeek-R1-Distill-Qwen-32B', value: 'DeepSeek-R1-Distill-Qwen-32B' },
  { label: 'bge-3', value: 'bge-3' },
  { label: 'gpt-4', value: 'gpt-4' },
  { label: 'claude-3', value: 'claude-3' }
];

// Mock API 函数
const mockGetDimensions = async (): Promise<Dimension[]> => {
  // TODO: 替换为真实的 API 调用
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockDimensions);
    }, 500);
  });
};

// 维度项组件
const DimensionItem = ({
  dimension,
  isSelected,
  onToggle,
  onModelChange,
  evalModelList
}: {
  dimension: Dimension;
  isSelected: boolean;
  onToggle: (dimension: Dimension, checked: boolean) => void;
  onModelChange: (
    dimensionId: string,
    field: 'defaultModel' | 'secondaryModel',
    value: string
  ) => void;
  evalModelList: any[];
}) => {
  const { t } = useTranslation();

  return (
    <Box
      p={4}
      border="1px solid"
      borderColor={isSelected ? 'primary.500' : 'myGray.200'}
      borderRadius="md"
      bg={isSelected ? 'primary.50' : 'white'}
      mb={3}
      cursor="pointer"
      _hover={{
        borderColor: isSelected ? 'primary.600' : 'myGray.300'
      }}
      onClick={() => onToggle(dimension, !isSelected)}
    >
      <HStack align="center" spacing={3} mb={3}>
        <Checkbox
          isChecked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggle(dimension, e.target.checked);
          }}
        />
        <VStack align="flex-start" flex={1} spacing={1}>
          <HStack>
            <Text fontWeight="medium" fontSize="sm">
              {dimension.name}
            </Text>
            <Text
              px={2}
              py={0.5}
              bg={dimension.type === 'builtin' ? 'blue.100' : 'green.100'}
              color={dimension.type === 'builtin' ? 'blue.600' : 'green.600'}
              borderRadius="sm"
              fontSize="xs"
            >
              {dimension.type === 'builtin'
                ? t('dashboard_evaluation:builtin')
                : t('dashboard_evaluation:custom')}
            </Text>
          </HStack>
          <Text fontSize="xs" color="myGray.600">
            {dimension.description}
          </Text>
        </VStack>
      </HStack>

      <HStack spacing={2} w="full" px={8}>
        <AIModelSelector
          w="300px"
          size="sm"
          bg="myGray.50"
          value={dimension.defaultModel}
          list={evalModelList.map((item) => ({
            label: item.name,
            value: item.model
          }))}
          onChange={(e) => {
            onModelChange(dimension.id, 'defaultModel', e);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        />

        {dimension.secondaryModel !== undefined && (
          <AIModelSelector
            w="300px"
            size="sm"
            bg="myGray.50"
            value={dimension.secondaryModel || ''}
            list={[
              { label: t('dashboard_evaluation:select_model_placeholder'), value: '' },
              ...evalModelList.map((item) => ({
                label: item.name,
                value: item.model
              }))
            ]}
            onChange={(e) => {
              onModelChange(dimension.id, 'secondaryModel', e);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        )}

        {dimension.id === '1' && (
          <Box onClick={(e) => e.stopPropagation()}>
            <QuestionTip label={t('dashboard_evaluation:dimension_config_tip')} />
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
  const [allDimensions, setAllDimensions] = useState<Dimension[]>([]);
  const { llmModelList } = useSystemStore();

  const evalModelList = useMemo(() => {
    return llmModelList.filter((item) => item.useInEvaluation);
  }, [llmModelList]);

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

  // 获取维度列表
  const { runAsync: fetchDimensions, loading: loadingDimensions } = useRequest2(mockGetDimensions, {
    manual: true,
    onSuccess: (data) => {
      // 合并选中状态
      const mergedDimensions = data.map((dimension) => {
        const selectedDimension = selectedDimensions.find((s) => s.id === dimension.id);
        return selectedDimension
          ? { ...dimension, ...selectedDimension, isSelected: true }
          : dimension;
      });
      setAllDimensions(mergedDimensions);
      replace(mergedDimensions);
    }
  });

  // 初始化数据
  useEffect(() => {
    if (isOpen) {
      fetchDimensions();
    }
  }, [isOpen, fetchDimensions]);

  // 处理维度选择
  const handleDimensionToggle = useCallback(
    (dimension: Dimension, checked: boolean) => {
      const currentDimensions = watchedDimensions;
      const updatedDimensions = currentDimensions.map((d) =>
        d.id === dimension.id ? { ...d, isSelected: checked } : d
      );
      replace(updatedDimensions);
    },
    [watchedDimensions, replace]
  );

  // 处理模型变更
  const handleModelChange = useCallback(
    (dimensionId: string, field: 'defaultModel' | 'secondaryModel', value: string) => {
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
    fetchDimensions();
  }, [fetchDimensions]);

  // 新建维度
  const handleCreateDimension = useCallback(() => {
    // TODO: 实现新建维度逻辑，打开新标签页
    window.open('/dimension/create', '_blank');
  }, []);

  // 确认选择
  const handleConfirm = useCallback(() => {
    const selectedDims = watchedDimensions.filter((d) => d.isSelected);
    onConfirm(selectedDims);
    onClose();
  }, [watchedDimensions, onConfirm, onClose]);

  const selectedCount = watchedDimensions.filter((d) => d.isSelected).length;
  const totalCount = watchedDimensions.length;

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
      isLoading={loadingDimensions}
    >
      <ModalBody flex={1}>
        <Flex justify="space-between" align="center" mb={4}>
          <Text fontSize="sm" color="myGray.600">
            {t('dashboard_evaluation:selected_count')} {selectedCount}/{totalCount}
          </Text>
          <HStack spacing={2}>
            <Button variant="whiteBase" size="md" onClick={handleCreateDimension}>
              {t('dashboard_evaluation:create_dimension')}
            </Button>
            <Button variant="whiteBase" size="md" onClick={handleRefresh}>
              <MyIcon name="common/refreshLight" w="14px" />
            </Button>
          </HStack>
        </Flex>

        <Box flex={1} overflow="auto">
          {fields.map((field, index) => (
            <DimensionItem
              key={field.id}
              dimension={watchedDimensions[index]}
              isSelected={watchedDimensions[index]?.isSelected || false}
              onToggle={handleDimensionToggle}
              onModelChange={handleModelChange}
              evalModelList={evalModelList}
            />
          ))}
        </Box>
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
