import React, { useMemo, useRef, useState } from 'react';
import { ModalFooter, ModalBody, Input, Button } from '@chakra-ui/react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@/web/common/hooks/useRequest';

const EditFolderModal = ({
  onClose,
  editCallback,
  isEdit = false,
  name
}: {
  onClose: () => void;
  editCallback: (name: string) => Promise<any>;
  isEdit: boolean;
  name?: string;
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const typeMap = useMemo(
    () =>
      isEdit
        ? {
            title: t('dataset.Edit Folder')
          }
        : {
            title: t('dataset.Create Folder')
          },
    [isEdit, t]
  );

  const { mutate: onSave, isLoading } = useRequest({
    mutationFn: () => {
      const val = inputRef.current?.value;
      if (!val) return Promise.resolve('');
      return editCallback(val);
    },
    onSuccess: (res) => {
      onClose();
    }
  });

  return (
    <MyModal isOpen onClose={onClose} iconSrc="/imgs/modal/folder.svg" title={typeMap.title}>
      <ModalBody>
        <Input
          ref={inputRef}
          defaultValue={name}
          placeholder={t('dataset.Folder Name') || ''}
          autoFocus
          maxLength={20}
        />
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button isLoading={isLoading} onClick={onSave}>
          {t('Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default EditFolderModal;

export const useEditFolder = () => {
  const [editFolderData, setEditFolderData] = useState<{
    id?: string;
    name?: string;
  }>();

  return {
    editFolderData,
    setEditFolderData
  };
};
