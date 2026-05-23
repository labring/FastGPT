import React, { useMemo } from 'react';
import { Input, Button, Box, Textarea, Flex } from '@chakra-ui/react';
import MyModal from '../../v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest } from '../../../hooks/useRequest';
import FormLabel from '../MyBox/FormLabel';
import { useForm } from 'react-hook-form';

export type EditFolderFormType = {
  id?: string;
  name?: string;
  intro?: string;
};
type CommitType = {
  name: string;
  intro?: string;
};

const EditFolderModal = ({
  onClose,
  onCreate,
  onEdit,
  id,
  name,
  intro
}: EditFolderFormType & {
  onClose: () => void;
  onCreate: (data: CommitType) => any;
  onEdit: (data: CommitType & { id: string }) => any;
}) => {
  const { t } = useTranslation();
  const isEdit = !!id;
  const { register, handleSubmit } = useForm<EditFolderFormType>({
    defaultValues: {
      name,
      intro
    }
  });

  const typeMap = useMemo(
    () =>
      isEdit
        ? {
            title: t('common:dataset.Edit Folder')
          }
        : {
            title: t('common:dataset.Create Folder')
          },
    [isEdit, t]
  );

  const { run: onSave, loading } = useRequest(
    ({ name = '', intro }: EditFolderFormType) => {
      const trimmedName = name.trim();
      if (!trimmedName) return;

      if (id) return onEdit({ id, name: trimmedName, intro });
      return onCreate({ name: trimmedName, intro });
    },
    {
      onSuccess: () => {
        onClose();
      }
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/folderFill"
      title={typeMap.title}
      size={'md'}
      contentPx={'32px'}
      contentPy={'32px'}
      borderRadius={'10px'}
      closeOnOverlayClick={false}
    >
      <Flex flexDirection={'column'} gap={6}>
        <Box>
          <FormLabel mb={2}>{t('common:input_name')}</FormLabel>
          <Input {...register('name', { required: true })} autoFocus maxLength={100} />
        </Box>
        <Box>
          <FormLabel mb={2}>{t('common:folder_description')}</FormLabel>
          <Textarea {...register('intro')} h={'100px'} minH={'100px'} maxLength={200} />
        </Box>
        <Flex justifyContent={'flex-end'} gap={3}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={loading} onClick={handleSubmit(onSave)}>
            {t('common:Confirm')}
          </Button>
        </Flex>
      </Flex>
    </MyModal>
  );
};

export default EditFolderModal;
