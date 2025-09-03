import React, { useCallback, useMemo, useState } from 'react';
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

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));

/**
 * 智能生成表单数据接口
 */
export interface IntelligentGenerationForm {
  name: string;
  generationModel: string;
  dataAmount: number;
  selectedDatasets: SelectedDatasetType;
}

/**
 * 智能生成弹窗组件属性接口
 */
interface IntelligentGenerationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: IntelligentGenerationForm) => void;
  defaultValues?: Partial<IntelligentGenerationForm>;
}

/**
 * 智能生成数据集弹窗组件
 * 用于配置智能生成数据集的参数
 */
const IntelligentGeneration = ({
  isOpen,
  onClose,
  onConfirm,
  defaultValues
}: IntelligentGenerationProps) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();

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
      generationModel: defaultValues?.generationModel || '',
      dataAmount: defaultValues?.dataAmount || 50,
      selectedDatasets: defaultValues?.selectedDatasets || []
    }
  });

  const nameValue = watch('name');
  const generationModelValue = watch('generationModel');
  const dataAmountValue = watch('dataAmount');
  const selectedDatasets = watch('selectedDatasets');

  // TODO: 计算所选知识库的总分块数量，用于设置数据量的最大值
  const maxDataAmount = useMemo(() => {
    // 临时设置为1000，待实现知识库分块数量计算
    return 1000;
  }, [selectedDatasets]);

  // 检查表单是否有效
  const isFormValid = useMemo(() => {
    return (
      nameValue.trim() !== '' &&
      generationModelValue.trim() !== '' &&
      selectedDatasets.length > 0 &&
      dataAmountValue >= 1
    );
  }, [nameValue, generationModelValue, selectedDatasets, dataAmountValue]);

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
  const handleFormSubmit = useCallback(
    (data: IntelligentGenerationForm) => {
      onConfirm(data);
    },
    [onConfirm]
  );

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="modal/edit"
      title={t('dashboard_evaluation:intelligent_generation_dataset')}
      w={'100%'}
      maxW={['90vw', '800px']}
      isCentered
    >
      <ModalBody>
        <VStack as="form" spacing={6} align="stretch" px={2}>
          {/* 取个名字 */}
          <Box>
            <FormLabel required mb={1}>
              {t('dashboard_evaluation:dataset_name_input')}
            </FormLabel>
            <Input
              bgColor="myGray.50"
              {...register('name', { required: true })}
              isInvalid={!!errors.name}
              placeholder={t('dashboard_evaluation:dataset_name_input_placeholder')}
            />
          </Box>

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
            avatar: item.avatar
          }))}
          onChange={handleDatasetSelect}
          onClose={onCloseDatasetSelect}
        />
      )}
    </MyModal>
  );
};

export default React.memo(IntelligentGeneration);
