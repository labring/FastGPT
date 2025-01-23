import React, { useMemo, useRef, useState } from 'react';
import { ModalFooter, ModalBody, Input, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

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
            title: t('common:dataset.Edit Folder')
          }
        : {
            title: t('common:dataset.Create Folder')
          },
    [isEdit, t]
  );

  const { mutate: onSave, isLoading } = useRequest({
    mutationFn: () => {
      const val = inputRef.current?.value;
      if (!val) return Promise.resolve('');
      return editCallback(val);
    },
    onSuccess: () => {
      onClose();
    }
  });

  return (
    <MyModal isOpen onClose={onClose} iconSrc="common/folderFill" title={typeMap.title}>
      <ModalBody>
        <Input
          ref={inputRef}
          defaultValue={name}
          placeholder={t('common:dataset.Folder Name') || ''}
          autoFocus
          maxLength={20}
        />
      </ModalBody>
      <ModalFooter>
        <Button isLoading={isLoading} onClick={onSave}>
          {t('common:common.Confirm')}
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
