import React from 'react';
import {
  ModalFooter,
  ModalBody,
  Input,
  Button,
  Box,
  Textarea,
  FormControl,
  FormErrorMessage,
  Flex
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal/index';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useForm } from 'react-hook-form';
import { postExportSkill } from '@/web/core/app/api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

interface ExportSkillModalProps {
  appId: string;
  appName: string;
  appIntro?: string;
  onClose: () => void;
}

interface ExportSkillFormType {
  skillName: string;
  skillDescription: string;
}

const ExportSkillModal = ({ appId, appIntro, onClose }: ExportSkillModalProps) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<ExportSkillFormType>({
    defaultValues: {
      skillName: '',
      skillDescription: appIntro || ''
    }
  });

  const { runAsync: onExport, loading } = useRequest(
    async (data: ExportSkillFormType) => {
      const response = await postExportSkill({
        appId,
        skillName: data.skillName,
        skillDescription: data.skillDescription
      });

      // Validate response type before downloading
      if (!response.type.includes('zip')) {
        throw new Error(t('skill:export_skill_invalid_response'));
      }

      // Handle file download
      const url = window.URL.createObjectURL(response);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${data.skillName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } finally {
        // Always revoke the Blob URL to prevent memory leak
        window.URL.revokeObjectURL(url);
      }

      return response;
    },
    {
      onSuccess: () => {
        onClose();
      },
      successToast: t('skill:export_skill_success'),
      errorToast: t('skill:export_skill_failed')
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={
        <Flex alignItems={'center'} gap={2}>
          <Box>{t('skill:export_skill_modal_title')}</Box>
          <QuestionTip label={t('skill:export_skill_modal_hint')} />
        </Flex>
      }
    >
      <ModalBody>
        <FormControl isInvalid={!!errors.skillName} mb={4}>
          <Flex alignItems={'center'} gap={4}>
            <MyTooltip label={t('skill:export_skill_name_helper')}>
              <FormLabel mb={0} minW={'80px'} required>
                {t('skill:export_skill_name_label')}
              </FormLabel>
            </MyTooltip>
            <Box flex={1}>
              <Input
                {...register('skillName', {
                  required: t('common:required_field', { defaultValue: '此字段为必填项' }),
                  maxLength: {
                    value: 64,
                    message: t('skill:export_skill_name_length_error', {
                      defaultValue: '名称长度不能超过 64 个字符'
                    })
                  },
                  pattern: {
                    value: /^[a-z0-9-]+$/,
                    message: t('skill:export_skill_name_error')
                  }
                })}
                bg={'myGray.50'}
                autoFocus
              />
              <FormErrorMessage>{errors.skillName?.message}</FormErrorMessage>
            </Box>
          </Flex>
        </FormControl>

        <FormControl isInvalid={!!errors.skillDescription}>
          <Flex alignItems={'flex-start'} gap={4}>
            <MyTooltip label={t('skill:export_skill_description_helper')}>
              <FormLabel mb={0} minW={'80px'} pt={2} required>
                {t('skill:export_skill_description_label')}
              </FormLabel>
            </MyTooltip>
            <Box flex={1}>
              <Textarea
                {...register('skillDescription', {
                  required: t('common:required_field', { defaultValue: '此字段为必填项' }),
                  maxLength: {
                    value: 1024,
                    message: t('skill:export_skill_description_length_error', {
                      defaultValue: '描述长度不能超过 1024 个字符'
                    })
                  }
                })}
                bg={'myGray.50'}
                rows={4}
              />
              <FormErrorMessage>{errors.skillDescription?.message}</FormErrorMessage>
            </Box>
          </Flex>
        </FormControl>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={loading} onClick={handleSubmit(onExport)} px={6}>
          {loading ? t('skill:export_skill_downloading') : t('common:Export')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ExportSkillModal;
