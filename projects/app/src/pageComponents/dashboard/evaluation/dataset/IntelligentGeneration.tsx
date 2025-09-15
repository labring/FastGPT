import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Grid,
  Input,
  ModalBody,
  ModalFooter,
  VStack,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import AIModelSelector from '@/components/Select/AIModelSelector';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { type SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import dynamic from 'next/dynamic';
import type { smartGenerateEvalDatasetBody } from '@fastgpt/global/core/evaluation/dataset/api';
import {
  postSmartGenerateEvaluationDataset,
  postCreateEvaluationDataset
} from '@/web/core/evaluation/dataset';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));

/**
 * 智能生成表单数据接口
 */
export interface IntelligentGenerationForm {
  name: string;
  generationModel: string;
  dataAmount: number;
  selectedDatasets: SelectedDatasetType;
  keywords?: string; // 关键词，仅在数据场景下使用
  collectionId?: string;
}

/**
 * 智能生成弹窗组件属性接口
 */
interface IntelligentGenerationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: IntelligentGenerationForm, datasetId?: string) => void;
  defaultValues?: Partial<IntelligentGenerationForm>;
  scene?: 'dataset' | 'data'; // 场景：数据集或数据
  returnDatasetId?: boolean; // 是否返回数据集ID，用于自动选择场景
}

const formatSubmitData = (
  params: IntelligentGenerationForm & { collectionId: string }
): smartGenerateEvalDatasetBody => {
  return {
    count: params.dataAmount,
    kbDatasetIds: params.selectedDatasets.map((v) => v.datasetId),
    intelligentGenerationModel: params.generationModel,
    collectionId: params.collectionId
  };
};

/**
 * 智能生成数据集弹窗组件
 * 用于配置智能生成数据集的参数
 */
const IntelligentGeneration = ({
  isOpen,
  onClose,
  onConfirm,
  defaultValues,
  scene = 'dataset',
  returnDatasetId = false
}: IntelligentGenerationProps) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();
  const [collectionId, setCollectionId] = useState<string>(defaultValues?.collectionId || '');

  const evalModelList = useMemo(() => {
    return llmModelList.filter((item) => item.useInEvaluation);
  }, [llmModelList]);

  useEffect(() => {
    defaultValues?.collectionId && setCollectionId(defaultValues?.collectionId);
  }, [defaultValues?.collectionId]);

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<IntelligentGenerationForm>({
    defaultValues: {
      name: defaultValues?.name || '',
      generationModel: defaultValues?.generationModel || evalModelList[0]?.model || '',
      dataAmount: defaultValues?.dataAmount || 50,
      selectedDatasets: defaultValues?.selectedDatasets || []
    }
  });

  const nameValue = watch('name');
  const generationModelValue = watch('generationModel');
  const dataAmountValue = watch('dataAmount');
  const selectedDatasets = watch('selectedDatasets');

  const { runAsync: onclickCreate, loading: creating } = useRequest2(
    async (data: IntelligentGenerationForm) => {
      let targetCollectionId = collectionId;

      // 只有当collectionId不存在时，才需要创建新的数据集
      if (!targetCollectionId) {
        targetCollectionId = await postCreateEvaluationDataset({ name: data.name });
        setCollectionId(targetCollectionId);
      }

      const params = formatSubmitData({
        ...data,
        collectionId: targetCollectionId
      });

      await postSmartGenerateEvaluationDataset(params);

      return { datasetId: targetCollectionId };
    },
    {
      successToast: t('common:create_success')
    }
  );

  const maxDataAmount = useMemo(() => {
    return selectedDatasets.length > 0
      ? selectedDatasets.reduce((pre, cur) => pre + (cur.dataCount || 0), 0)
      : defaultValues?.dataAmount || 50;
  }, [selectedDatasets, defaultValues]);

  useEffect(() => {
    if (maxDataAmount < 50) {
      setValue('dataAmount', maxDataAmount);
    }
  }, [maxDataAmount, setValue]);

  // 检查表单是否有效
  const isFormValid = useMemo(() => {
    const baseValid =
      generationModelValue.trim() !== '' && selectedDatasets.length > 0 && dataAmountValue >= 1;

    if (scene === 'dataset') {
      return baseValid && nameValue.trim() !== '';
    } else {
      return baseValid;
    }
  }, [nameValue, generationModelValue, selectedDatasets, dataAmountValue, scene]);

  // 处理数据量变化
  const handleDataAmountChange = useCallback(
    (value: number | undefined) => {
      const numValue = value || 1;
      const clampedValue = Math.max(1, Math.min(maxDataAmount, numValue));
      setValue('dataAmount', clampedValue);
    },
    [maxDataAmount, setValue]
  );

  // 处理知识库选择
  const handleDatasetSelect = useCallback(
    (datasets: SelectedDatasetType) => {
      setValue('selectedDatasets', datasets);
    },
    [setValue]
  );

  // 处理表单提交
  const handleFormSubmit = async (data: IntelligentGenerationForm) => {
    const result = await onclickCreate(data);
    if (returnDatasetId) {
      onConfirm(data, result?.datasetId);
    } else {
      onConfirm(data);
    }
  };

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="core/app/aiLight"
      iconColor={'primary.600'}
      title={
        scene === 'dataset'
          ? t('dashboard_evaluation:intelligent_generation_dataset')
          : t('dashboard_evaluation:intelligent_generate_data')
      }
      w={'100%'}
      maxW={['90vw', '600px']}
      isCentered
    >
      <ModalBody>
        <VStack as="form" spacing={6} align="stretch" px={2}>
          {/* 取个名字 - 仅在数据集场景下显示 */}
          {scene === 'dataset' && (
            <Box>
              <FormLabel required mb={1}>
                {t('dashboard_evaluation:dataset_name_input')}
              </FormLabel>
              <Input
                bgColor="myGray.50"
                {...register('name', { required: scene === 'dataset' })}
                isInvalid={!!errors.name}
                placeholder={t('dashboard_evaluation:dataset_name_input_placeholder')}
              />
            </Box>
          )}

          {/* 生成依据 - 选择知识库 */}
          <Box>
            <FormLabel required mb={2}>
              {t('dashboard_evaluation:generation_basis')}
            </FormLabel>
            <Grid
              gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
              gridGap={4}
              minW={'350px'}
              w={'100%'}
            >
              <Button
                h={10}
                leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
                onClick={onOpenDatasetSelect}
                colorScheme="blue"
              >
                {t('dashboard_evaluation:select_knowledge_base')}
              </Button>
              {selectedDatasets.map((item) => (
                <Flex
                  key={item.datasetId}
                  alignItems={'center'}
                  h={10}
                  boxShadow={'sm'}
                  bg={'white'}
                  border={'base'}
                  px={2}
                  borderRadius={'md'}
                >
                  <Avatar src={item.avatar} w={'18px'} borderRadius={'xs'} />
                  <Box
                    ml={1.5}
                    flex={'1 0 0'}
                    w={0}
                    className="textEllipsis"
                    fontWeight={'bold'}
                    fontSize={['sm', 'sm']}
                  >
                    {item.name}
                  </Box>
                </Flex>
              ))}
            </Grid>
          </Box>

          {/* 数据量 */}
          <Box>
            <FormLabel required mb={1}>
              {t('dashboard_evaluation:data_amount')}
            </FormLabel>
            <MyNumberInput
              value={dataAmountValue}
              onChange={handleDataAmountChange}
              min={1}
              max={maxDataAmount}
              precision={0}
              step={1}
              bg="myGray.50"
              w="100%"
              h="40px"
              inputFieldProps={{
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
          </Box>

          {/* 生成模型 */}
          <Box>
            <FormLabel required mb={1}>
              {t('dashboard_evaluation:generation_model')}
            </FormLabel>
            <AIModelSelector
              bg="myGray.50"
              value={generationModelValue}
              list={llmModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(value) => setValue('generationModel', value)}
              placeholder={t('dashboard_evaluation:generation_model_placeholder')}
            />
          </Box>
        </VStack>
      </ModalBody>

      <ModalFooter>
        <Button variant="whiteBase" mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          variant="primary"
          isLoading={creating}
          isDisabled={!isFormValid}
          onClick={handleSubmit(handleFormSubmit)}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>

      {/* 知识库选择弹窗 */}
      {isOpenDatasetSelect && (
        <DatasetSelectModal
          isOpen={isOpenDatasetSelect}
          defaultSelectedDatasets={selectedDatasets.map((item) => ({
            datasetId: item.datasetId,
            vectorModel: item.vectorModel,
            name: item.name,
            avatar: item.avatar,
            dataCount: item.dataCount
          }))}
          onChange={handleDatasetSelect}
          onClose={onCloseDatasetSelect}
          scene="smartGenerate"
        />
      )}
    </MyModal>
  );
};

export default React.memo(IntelligentGeneration);
