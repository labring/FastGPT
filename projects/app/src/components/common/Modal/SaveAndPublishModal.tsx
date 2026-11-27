import { Box, Button, Input, Flex } from '@chakra-ui/react';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

type FormType = {
  versionName: string;
};

type SaveAndPublishModalProps = {
  title?: string;
  tip?: string;
  onClose: () => void;
  isLoading: boolean;
  /** 由调用方处理业务错误提示；弹窗会捕获提交期 rejection 并保持开启，便于用户修正后重试。 */
  onConfirm: (versionName: string) => Promise<void>;
};

const SaveAndPublishModal = ({
  title,
  tip,
  onClose,
  isLoading,
  onConfirm
}: SaveAndPublishModalProps) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm<FormType>({
    defaultValues: {
      versionName: formatTime2YMDHMS(new Date())
    }
  });

  return (
    <MyModal
      title={title || t('common:core.workflow.Save and publish')}
      isOpen
      onClose={onClose}
      isCentered
      footer={
        <>
          <Button onClick={onClose} variant={'whiteBase'}>
            {t('common:Cancel')}
          </Button>
          <Button
            isLoading={isLoading}
            onClick={handleSubmit(async (data) => {
              try {
                await onConfirm(data.versionName);
              } catch {
                // 调用方已处理错误提示；此处捕获避免 react-hook-form handleSubmit 抛出未处理的 Promise Rejection，同时保持弹窗开启便于修正重试。
              }
            })}
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Flex flexDirection={'column'} gap={6}>
        <Box>
          <FormLabel mb={2}>{t('common:Name')}</FormLabel>
          <Input
            size={'sm'}
            autoFocus
            placeholder={t('app:app.Version name')}
            {...register('versionName', {
              required: t('app:app.version_name_tips')
            })}
          />
        </Box>
        <Box fontSize={'12px'} color={'myGray.500'} mt={-2}>
          {tip ?? t('app:app.version_publish_tips')}
        </Box>
      </Flex>
    </MyModal>
  );
};

export default SaveAndPublishModal;
