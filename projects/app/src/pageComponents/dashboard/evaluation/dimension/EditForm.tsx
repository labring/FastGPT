import React, { useCallback, useEffect, useMemo } from 'react';
import { Box, Button, Input, VStack, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import CitationTemplate from './CitationTemplate';

/**
 * 评估维度表单数据接口
 */
export interface EvaluationDimensionForm {
  name: string;
  description: string;
  prompt: string;
}

/**
 * 评估维度编辑表单组件属性接口
 */
interface EditFormProps {
  defaultValues?: Partial<EvaluationDimensionForm>;
  onSubmit: (data: EvaluationDimensionForm) => void;
  onValidationChange?: (isValid: boolean) => void;
}

/**
 * 评估维度编辑表单组件
 * 用于创建或编辑评估维度的配置信息
 */
const EditForm = ({ defaultValues, onSubmit, onValidationChange }: EditFormProps) => {
  const { t } = useTranslation();

  const {
    isOpen: isCitationTemplateOpen,
    onOpen: onOpenCitationTemplate,
    onClose: onCloseCitationTemplate
  } = useDisclosure();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid }
  } = useForm<EvaluationDimensionForm>({
    defaultValues: {
      name: defaultValues?.name || '',
      description: defaultValues?.description || '',
      prompt: defaultValues?.prompt || ''
    },
    mode: 'onChange', // 实时验证
    reValidateMode: 'onChange'
  });

  const promptValue = watch('prompt');
  const nameValue = watch('name');

  // 检查必填字段是否有效
  const isFormValid = useMemo(() => {
    return nameValue.trim() !== '' && promptValue.trim() !== '';
  }, [nameValue, promptValue]);

  // 将验证状态传递给父组件
  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(isFormValid);
    }
  }, [isFormValid, onValidationChange]);

  // 处理引用模板确认
  const handleCitationTemplateConfirm = useCallback(
    (dimension: string, template: string) => {
      setValue('prompt', template);
    },
    [setValue]
  );

  // 处理表单提交
  const handleFormSubmit = useCallback(
    (data: EvaluationDimensionForm) => {
      onSubmit(data);
    },
    [onSubmit]
  );

  return (
    <VStack
      as="form"
      id="evaluation-dimension-form"
      spacing={4}
      align="stretch"
      onSubmit={handleSubmit(handleFormSubmit)}
      py={4}
    >
      {/* 名称输入框 */}
      <Flex gap={10} h={10}>
        <FormLabel
          w={'80px'}
          h={10}
          pb={'30px'}
          mt={3}
          display={'flex'}
          alignItems={'center'}
          color={'myGray.900'}
          fontSize={'14px'}
          fontWeight={'medium'}
          required
        >
          {t('dashboard_evaluation:dimension_name_label')}
        </FormLabel>
        <Input h={10} {...register('name', { required: true })} isInvalid={!!errors.name} />
      </Flex>

      {/* 介绍输入框 */}
      <Flex gap={10}>
        <FormLabel
          w={'80px'}
          h={10}
          display={'flex'}
          alignItems={'center'}
          color={'myGray.900'}
          fontSize={'14px'}
          fontWeight={'medium'}
        >
          {t('dashboard_evaluation:dimension_description_label')}
        </FormLabel>
        <MyTextarea {...register('description')} rows={3} />
      </Flex>

      {/* 提示词输入框和引用模板按钮 */}
      <Flex gap={10}>
        <FormLabel
          w={'80px'}
          h={10}
          pb={'30px'}
          mt={'6px'}
          display={'flex'}
          alignItems={'center'}
          color={'myGray.900'}
          fontSize={'14px'}
          fontWeight={'medium'}
          required
        >
          {t('dashboard_evaluation:prompt_label')}
        </FormLabel>
        <Flex w={'100%'} flexDirection={'column'}>
          <Flex justify="flex-start" mb={2}>
            <Button variant="whiteBase" size="xs" onClick={onOpenCitationTemplate}>
              {t('dashboard_evaluation:citation_template_button')}
            </Button>
          </Flex>
          <MyTextarea
            value={promptValue}
            onChange={(e) => setValue('prompt', e.target.value)}
            rows={15}
          />
        </Flex>
      </Flex>

      {/* 引用模板弹窗 */}
      {isCitationTemplateOpen && (
        <CitationTemplate
          isOpen={isCitationTemplateOpen}
          onClose={onCloseCitationTemplate}
          onConfirm={handleCitationTemplateConfirm}
        />
      )}
    </VStack>
  );
};

export default React.memo(EditForm);
