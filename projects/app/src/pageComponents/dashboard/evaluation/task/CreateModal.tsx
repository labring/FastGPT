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
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MySelect from '@fastgpt/web/components/common/MySelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import ManageDimension, { type Dimension } from './ManageDimension';
import AppSelect from '@/components/Select/AppSelect';

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
  onSubmit: (data: TaskFormData) => void;
}

// Mock 数据 - TODO: 替换为真实 API
const mockApps = [
  { label: '智能客服助手', value: 'app1', icon: '/imgs/app/avatar/gpt.svg' },
  { label: '文档问答系统', value: 'app2', icon: '/imgs/app/avatar/gpt.svg' },
  { label: '代码助手', value: 'app3', icon: '/imgs/app/avatar/gpt.svg' }
];

const mockAppVersions = [
  { label: 'v1.0.0', value: 'v1.0.0' },
  { label: 'v1.1.0', value: 'v1.1.0' },
  { label: 'v2.0.0', value: 'v2.0.0' }
];

const mockDatasets = [
  { label: '客服问答数据集', value: 'dataset1', icon: '/imgs/dataset/avatar/dataset.svg' },
  { label: '技术文档数据集', value: 'dataset2', icon: '/imgs/dataset/avatar/dataset.svg' },
  { label: '产品介绍数据集', value: 'dataset3', icon: '/imgs/dataset/avatar/dataset.svg' }
];

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

  // TODO: 替换为真实的 API 调用
  const { runAsync: createTask, loading: isCreating } = useRequest2(
    async (data: TaskFormData) => {
      // Mock API 调用
      console.log('Creating task:', data);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return data;
    },
    {
      manual: true,
      successToast: t('common:create_success'),
      onSuccess: (data) => {
        onSubmit(data);
        onClose();
      }
    }
  );

  // 获取选中应用的版本列表
  // TODO: 根据选中的应用 ID 获取对应的版本列表
  const appVersionOptions = useMemo(() => {
    if (!watchedValues.appId) return [];
    return mockAppVersions;
  }, [watchedValues.appId]);

  const selectedDimensions = watchedValues.selectedDimensions || [];

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
                  required: t('dashboard_evaluation:task_name_input_placeholder')
                })}
                placeholder="appointment/sql"
                bg="myGray.50"
                h={10}
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
                  value={watchedValues.appId}
                  placeholder={t('dashboard_evaluation:evaluation_app_select_placeholder')}
                  onSelect={(id) => {
                    setValue('appId', id);
                    setValue('appVersion', ''); // 重置版本选择
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
                  h={10}
                  placeholder={t('dashboard_evaluation:evaluation_app_version_select_placeholder')}
                  value={watchedValues.appVersion}
                  list={appVersionOptions}
                  onChange={(val) => setValue('appVersion', val)}
                  isDisabled={!watchedValues.appId}
                  isInvalid={!!errors.appVersion}
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
                    h={10}
                    placeholder={t('dashboard_evaluation:evaluation_dataset_select_placeholder')}
                    value={watchedValues.datasetId}
                    list={mockDatasets}
                    onChange={(val) => setValue('datasetId', val)}
                    isInvalid={!!errors.datasetId}
                  />
                </Box>
                <Button
                  variant="whiteBase"
                  size="md"
                  leftIcon={<MyIcon name="common/importLight" w="14px" />}
                  onClick={() => {
                    // TODO: 实现新建/导入数据集功能
                    console.log('Import dataset');
                  }}
                  flexShrink={0}
                >
                  {t('dashboard_evaluation:create_import_dataset')}
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
                      {selectedDimensions.map((dimension) => (
                        <Flex
                          key={dimension.id}
                          align="center"
                          justify="space-between"
                          p={3}
                          bg="myGray.50"
                        >
                          <HStack spacing={3}>
                            <Text fontSize="sm" fontWeight="medium" color={'myGray.900'}>
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
                                ? t('dashboard_evaluation:builtin_dimension')
                                : t('dashboard_evaluation:custom_dimension')}
                            </Text>
                            <HStack spacing={2}>
                              {/* <MyIcon name="core/ai/model" w="14px" color="myGray.500" /> */}
                              <Text fontSize="xs" color="myGray.600">
                                {dimension.defaultModel}
                              </Text>
                            </HStack>
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
                      ))}
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
            isDisabled={selectedDimensions.length === 0}
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
    </>
  );
};

export default CreateModal;
