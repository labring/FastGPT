import React, { useMemo } from 'react';
import { ModalFooter, ModalBody, Input, Button, Box, Textarea } from '@chakra-ui/react';
import MyModal from './index';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '../../../hooks/useRequest';
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

  const { run: onSave, loading } = useRequest2(
    ({ name = '', intro }: EditFolderFormType) => {
      if (!name) return;

      if (isEdit) return onEdit({ id, name, intro });
      return onCreate({ name, intro });
    },
    {
      onSuccess: (res) => {
        onClose();
      }
    }
  );

  return (
    <MyModal isOpen onClose={onClose} iconSrc="common/folderFill" title={typeMap.title}>
      <ModalBody>
        <Box>
          <FormLabel mb={1}>{t('common:common.Input name')}</FormLabel>
          <Input
            {...register('name', { required: true })}
            bg={'myGray.50'}
            autoFocus
            maxLength={20}
          />
        </Box>
        <Box mt={4}>
          <FormLabel mb={1}>{t('common:common.Input folder description')}</FormLabel>
          <Textarea {...register('intro')} bg={'myGray.50'} maxLength={200} />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button isLoading={loading} onClick={handleSubmit(onSave)} px={6}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default EditFolderModal;
