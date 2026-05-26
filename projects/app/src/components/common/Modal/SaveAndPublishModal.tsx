import { Box, Button, Input } from '@chakra-ui/react';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';

type FormType = {
  versionName: string;
};

const SaveAndPublishModal = ({
  title,
  onClose,
  isLoading,
  onConfirm
}: {
  title?: string;
  onClose: () => void;
  isLoading: boolean;
  onConfirm: (versionName: string) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm<FormType>({
    defaultValues: {
      versionName: formatTime2YMDHMS(new Date())
    }
  });

  return (
    <MyModal
      title={title || t('common:core.workflow.Save and publish')}
      iconSrc={'core/workflow/publish'}
      maxW={'400px'}
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
              await onConfirm(data.versionName);
            })}
          >
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Box mb={2.5} color={'myGray.900'} fontSize={'14px'} fontWeight={'500'}>
        {t('common:Name')}
      </Box>
      <Box mb={3}>
        <Input
          autoFocus
          placeholder={t('app:app.Version name')}
          bg={'myWhite.600'}
          {...register('versionName', {
            required: t('app:app.version_name_tips')
          })}
        />
      </Box>
      <Box fontSize={'14px'}>{t('app:app.version_publish_tips')}</Box>
    </MyModal>
  );
};

export default SaveAndPublishModal;
