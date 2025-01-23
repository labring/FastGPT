import { Box, Button, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';

type FormType = {
  versionName: string;
  isPublish: boolean | undefined;
};

const SaveAndPublishModal = ({
  onClose,
  isLoading,
  onClickSave
}: {
  onClose: () => void;
  isLoading: boolean;
  onClickSave: (data: { isPublish: boolean; versionName: string }) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast({
    containerStyle: {
      mt: '60px',
      fontSize: 'sm'
    }
  });
  const { register, handleSubmit } = useForm<FormType>({
    defaultValues: {
      versionName: formatTime2YMDHMS(new Date()),
      isPublish: undefined
    }
  });

  return (
    <MyModal
      title={t('common:core.workflow.Save and publish')}
      iconSrc={'core/workflow/publish'}
      maxW={'400px'}
      isOpen
      onClose={onClose}
    >
      <ModalBody>
        <Box mb={2.5} color={'myGray.900'} fontSize={'14px'} fontWeight={'500'}>
          {t('common:common.Name')}
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
      </ModalBody>
      <ModalFooter gap={3}>
        <Button
          onClick={() => {
            onClose();
          }}
          variant={'whiteBase'}
        >
          {t('common:common.Cancel')}
        </Button>
        <Button
          isLoading={isLoading}
          onClick={handleSubmit(async (data) => {
            await onClickSave({ ...data, isPublish: true });
            toast({
              status: 'success',
              title: t('app:publish_success'),
              position: 'top-right',
              isClosable: true
            });
            onClose();
          })}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default SaveAndPublishModal;
