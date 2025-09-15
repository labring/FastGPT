import React, { useState, useCallback, useMemo } from 'react';
import { Box, Button, Flex, Textarea, VStack, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import {
  DIMENSION_LIST,
  type DimensionType,
  getDimensionTemplates
} from './constants/evaluationTemplates';

/**
 * 引用模板组件属性接口
 * @param isOpen - 是否打开弹窗
 * @param onClose - 关闭弹窗回调
 * @param onConfirm - 确认回调，返回模板内容
 */
interface CitationTemplateProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (dimension: string, template: string) => void;
}

/**
 * 引用模板表单数据接口
 */
interface CitationTemplateForm {
  dimension: string;
  template: string;
}

/**
 * 引用模板组件
 * 用于选择评估维度并编辑对应的评分模板
 */
const CitationTemplate = ({ isOpen, onClose, onConfirm }: CitationTemplateProps) => {
  const { t, i18n } = useTranslation();
  const [selectedDimension, setSelectedDimension] = useState<DimensionType>(DIMENSION_LIST[0]);

  // 判断当前语言是否为英文
  const isEnglish = useMemo(() => {
    return i18n.language === 'en' || i18n.language === 'en-US';
  }, [i18n.language]);

  // 维度模板映射
  const dimensionTemplates = useMemo(() => {
    return getDimensionTemplates(isEnglish);
  }, [isEnglish]);

  const { register, handleSubmit, setValue, reset } = useForm<CitationTemplateForm>({
    defaultValues: {
      dimension: DIMENSION_LIST[0],
      template: dimensionTemplates[DIMENSION_LIST[0]]
    }
  });

  // 维度显示名称映射
  const dimensionDisplayNames = useMemo(
    () => ({
      correctness: t('dashboard_evaluation:correctness'),
      conciseness: t('dashboard_evaluation:conciseness'),
      harmfulness: t('dashboard_evaluation:harmfulness'),
      controversiality: t('dashboard_evaluation:controversiality'),
      creativity: t('dashboard_evaluation:creativity'),
      criminality: t('dashboard_evaluation:criminality'),
      depth: t('dashboard_evaluation:depth'),
      detail: t('dashboard_evaluation:details')
    }),
    [t]
  );

  // 处理维度选择
  const handleDimensionSelect = useCallback(
    (dimension: DimensionType) => {
      setSelectedDimension(dimension);
      setValue('dimension', dimension);
      // 根据选择的维度加载对应的模板内容
      setValue('template', dimensionTemplates[dimension]);
    },
    [setValue, dimensionTemplates]
  );

  // 处理确认
  const handleConfirm = useCallback(() => {
    handleSubmit((data) => {
      onConfirm?.(data.dimension, data.template);
      onClose();
    })();
  }, [handleSubmit, onConfirm, onClose]);

  // 处理取消
  const handleCancel = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="common/templateMarket"
      iconColor="blue.600"
      title={t('dashboard_evaluation:citation_template')}
      w={'100%'}
      maxW={['90vw', '800px']}
      h="610px"
    >
      <ModalBody>
        <Flex h={'full'}>
          {/* 左侧维度列表 */}
          <Box
            w="200px"
            border="1px solid"
            borderColor="myGray.200"
            borderRadius="sm"
            bg="myGray.50"
            p={1}
            mr={4}
            h="fit-content"
          >
            <VStack spacing={1} align="stretch">
              {DIMENSION_LIST.map((dimension) => (
                <Button
                  key={dimension}
                  variant="ghost"
                  size="sm"
                  justifyContent="flex-start"
                  onClick={() => handleDimensionSelect(dimension)}
                  w="full"
                  bg={selectedDimension === dimension ? 'white' : 'transparent'}
                  color={selectedDimension === dimension ? 'primary.500' : 'myGray.700'}
                  border={selectedDimension === dimension ? '1px solid' : 'none'}
                  borderColor={selectedDimension === dimension ? 'myGray.200' : 'transparent'}
                  borderRadius="sm"
                  px={3}
                  py={2}
                  _hover={{
                    bg: selectedDimension === dimension ? 'white' : 'myGray.100',
                    color: selectedDimension === dimension ? 'primary.600' : 'myGray.700'
                  }}
                >
                  {dimensionDisplayNames[dimension]}
                </Button>
              ))}
            </VStack>
          </Box>

          {/* 右侧内容区域 */}
          <Box flex={1} display="flex" flexDirection="column">
            <Textarea
              flex={1}
              {...register('template', { required: true })}
              resize="none"
              bg="myGray.50"
              border="1px solid"
              borderColor="myGray.200"
              _focus={{
                borderColor: 'primary.500',
                boxShadow: '0 0 0 1px var(--chakra-colors-primary-500)'
              }}
              minH="300px"
              h="full"
            />
          </Box>
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={handleCancel}>
          {t('common:Cancel')}
        </Button>
        <Button variant={'primary'} onClick={handleConfirm}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(CitationTemplate);
