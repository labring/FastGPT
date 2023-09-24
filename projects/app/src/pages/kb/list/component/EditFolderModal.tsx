import React, { useMemo, useRef } from 'react';
import { ModalFooter, ModalBody, Input, Button } from '@chakra-ui/react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'react-i18next';
import { useRequest } from '@/hooks/useRequest';
import { postCreateDataset, putDatasetById } from '@/api/core/dataset';
import { FolderAvatarSrc, KbTypeEnum } from '@/constants/dataset';

const EditFolderModal = ({
  onClose,
  onSuccess,
  id,
  parentId,
  name
}: {
  onClose: () => void;
  onSuccess: () => void;
  id?: string;
  parentId?: string;
  name?: string;
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const typeMap = useMemo(
    () =>
      id
        ? {
            title: t('kb.Edit Folder')
          }
        : {
            title: t('kb.Create Folder')
          },
    [id, t]
  );

  const { mutate: onSave, isLoading } = useRequest({
    mutationFn: () => {
      const val = inputRef.current?.value;
      if (!val) return Promise.resolve('');
      if (id) {
        return putDatasetById({
          id,
          name: val
        });
      }
      return postCreateDataset({
        parentId,
        name: val,
        type: KbTypeEnum.folder,
        avatar: FolderAvatarSrc,
        tags: []
      });
    },
    onSuccess: (res) => {
      if (!res) return;
      onSuccess();
      onClose();
    }
  });

  return (
    <MyModal isOpen onClose={onClose} title={typeMap.title}>
      <ModalBody>
        <Input
          ref={inputRef}
          defaultValue={name}
          placeholder={t('kb.Folder Name') || ''}
          autoFocus
          maxLength={20}
        />
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'base'} onClick={onClose}>
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
