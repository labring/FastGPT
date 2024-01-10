import React from 'react';
import { useTranslation } from 'next-i18next';
import MyModal from '@/components/MyModal';
import { Box, Input, Textarea, ModalBody, ModalFooter, Button } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRequest } from '@/web/common/hooks/useRequest';

const CreateFileModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: (e: { filename: string; content: string }) => Promise<void>;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      filename: '',
      content: ''
    }
  });

  const { mutate, isLoading } = useRequest({
    mutationFn: () => handleSubmit(onSuccess)(),
    onSuccess: () => {
      onClose();
    }
  });

  return (
    <MyModal
      title={t('file.Create File')}
      iconSrc="/imgs/modal/txt.svg"
      isOpen
      w={'600px'}
      top={'15vh'}
    >
      <ModalBody>
        <Box mb={1} fontSize={'sm'}>
          {t('common.file.File Name')}
        </Box>
        <Input
          mb={5}
          {...register('filename', {
            required: t('common.file.Filename Can not Be Empty')
          })}
        />
        <Box mb={1} fontSize={'sm'}>
          {t('common.file.File Content')}
        </Box>
        <Textarea
          {...register('content', {
            required: t('common.file.File content can not be empty')
          })}
          rows={12}
          whiteSpace={'nowrap'}
          resize={'both'}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button isLoading={isLoading} onClick={mutate}>
          {t('common.Confirm Create')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default CreateFileModal;
