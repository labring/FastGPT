import React, { useCallback, useMemo } from 'react';
import {
  ModalFooter,
  ModalBody,
  Input,
  Button,
  Box,
  Textarea,
  Flex,
  HStack
} from '@chakra-ui/react';
import MyModal from './index';
import { useTranslation } from 'next-i18next';
import { useRequest } from '../../../hooks/useRequest';
import FormLabel from '../MyBox/FormLabel';
import { useForm } from 'react-hook-form';
import Avatar from '../Avatar';
import { useUploadAvatar } from '../../../common/file/hooks/useUploadAvatar';
import MyTooltip from '../MyTooltip';
import type { CreatePostPresignedUrlResult } from '@fastgpt/global/common/file/s3/type';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';

export type EditFolderFormType = {
  id?: string;
  name?: string;
  intro?: string;
  avatar?: string;
};

type CommitType = {
  name: string;
  intro?: string;
  avatar?: string;
};

const EditFolderModal = ({
  onClose,
  onCreate,
  onEdit,
  id,
  name,
  intro,
  avatar: defaultAvatar,
  getPresignedUrl
}: EditFolderFormType & {
  onClose: () => void;
  onCreate: (data: CommitType) => any;
  onEdit: (data: CommitType & { id: string }) => any;
  getPresignedUrl?: (params: { filename: string }) => Promise<CreatePostPresignedUrlResult>;
}) => {
  const { t } = useTranslation();
  const isEdit = !!id;

  const { register, handleSubmit, watch, setValue } = useForm<EditFolderFormType>({
    defaultValues: { name, intro, avatar: defaultAvatar ?? FolderImgUrl }
  });
  const avatar = watch('avatar');

  const afterUploadAvatar = useCallback(
    (avatarUrl: string) => setValue('avatar', avatarUrl),
    [setValue]
  );
  const { Component: AvatarUploader, handleFileSelectorOpen } = useUploadAvatar(
    getPresignedUrl ?? (() => Promise.reject('No presigned URL provider')),
    { onSuccess: afterUploadAvatar }
  );

  const title = useMemo(
    () => (isEdit ? t('common:dataset.Edit Folder') : t('common:dataset.Create Folder')),
    [isEdit, t]
  );

  const { run: onSave, loading } = useRequest(
    ({ name = '', intro, avatar }: EditFolderFormType) => {
      if (!name) return;
      if (isEdit) return onEdit({ id, name, intro, avatar });
      return onCreate({ name, intro, avatar });
    },
    {
      onSuccess: () => onClose()
    }
  );

  return (
    <MyModal isOpen onClose={onClose} title={title} w="500px">
      <ModalBody px="32px" py="32px">
        <Flex alignItems="center">
          <FormLabel required w="80px" flexShrink={0}>
            {t('common:app_icon_and_name')}
          </FormLabel>
          <HStack flex={1} spacing={3}>
            {getPresignedUrl && (
              <MyTooltip label={t('common:set_avatar')}>
                <Avatar
                  src={avatar}
                  w={'2rem'}
                  h={'2rem'}
                  flexShrink={0}
                  cursor={'pointer'}
                  borderRadius={'sm'}
                  onClick={handleFileSelectorOpen}
                />
              </MyTooltip>
            )}
            <Input {...register('name', { required: true })} autoFocus maxLength={100} />
          </HStack>
        </Flex>
        <Flex alignItems="flex-start" mt={4}>
          <FormLabel w="80px" flexShrink={0} mt={2}>
            {t('common:plugin.Description')}
          </FormLabel>
          <Textarea
            {...register('intro')}
            flex={1}
            maxLength={200}
            resize="vertical"
            minH="50px"
          />
        </Flex>
      </ModalBody>
      <ModalFooter gap={3}>
        <Button variant="whiteBase" onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={loading} onClick={handleSubmit(onSave)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
      {getPresignedUrl && <AvatarUploader />}
    </MyModal>
  );
};

export default EditFolderModal;
