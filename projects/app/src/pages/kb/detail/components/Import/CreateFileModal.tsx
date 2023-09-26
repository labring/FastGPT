import React from 'react';
import { useTranslation } from 'next-i18next';
import MyModal from '@/components/MyModal';
import { Box, Input, Textarea, ModalBody, ModalFooter, Button } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';

const CreateFileModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: (e: { filename: string; content: string }) => void;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      filename: '',
      content: ''
    }
  });

  return (
    <MyModal title={t('file.Create File')} isOpen w={'600px'} top={'15vh'}>
      <ModalBody>
        <Box mb={1} fontSize={'sm'}>
          文件名
        </Box>
        <Input
          mb={5}
          {...register('filename', {
            required: '文件名不能为空'
          })}
        />
        <Box mb={1} fontSize={'sm'}>
          文件内容
        </Box>
        <Textarea
          {...register('content', {
            required: '文件内容不能为空'
          })}
          rows={12}
          whiteSpace={'nowrap'}
          resize={'both'}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant={'base'} mr={4} onClick={onClose}>
          取消
        </Button>
        <Button
          onClick={() => {
            handleSubmit(onSuccess)();
            onClose();
          }}
        >
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default CreateFileModal;
