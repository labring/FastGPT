import React, { useCallback } from 'react';
import { ModalFooter, ModalBody, Input, Button, Box, Textarea, HStack } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal/index';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useForm } from 'react-hook-form';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';

export type EditResourceInfoFormType = {
  id: string;
  name: string;
  avatar?: string;
  intro?: string;
};

const EditResourceModal = ({
  onClose,
  onEdit,
  title,
  ...defaultForm
}: EditResourceInfoFormType & {
  title: string;
  onClose: () => void;
  onEdit: (data: EditResourceInfoFormType) => any;
}) => {
  const { t } = useTranslation();
  const { register, watch, setValue, handleSubmit } = useForm<EditResourceInfoFormType>({
    defaultValues: defaultForm
  });
  const avatar = watch('avatar');

  const { runAsync: onSave, loading } = useRequest2(
    (data: EditResourceInfoFormType) => onEdit(data),
    {
      onSuccess: (res) => {
        onClose();
      }
    }
  );

  const afterUploadAvatar = useCallback(
    (avatar: string) => {
      setValue('avatar', avatar);
    },
    [setValue]
  );
  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, { onSuccess: afterUploadAvatar });

  return (
    <MyModal isOpen onClose={onClose} iconSrc={avatar} title={title}>
      <ModalBody>
        <Box>
          <FormLabel mb={1}>{t('common:core.app.Name and avatar')}</FormLabel>
          <HStack spacing={4}>
            <MyTooltip label={t('common:set_avatar')}>
              <Avatar
                flex={'0 0 2rem'}
                src={avatar}
                w={'2rem'}
                h={'2rem'}
                cursor={'pointer'}
                borderRadius={'sm'}
                onClick={handleAvatarSelectorOpen}
              />
            </MyTooltip>
            <Input
              {...register('name', { required: true })}
              bg={'myGray.50'}
              autoFocus
              maxLength={100}
            />
          </HStack>
        </Box>
        <Box mt={4}>
          <FormLabel mb={1}>{t('common:Intro')}</FormLabel>
          <Textarea {...register('intro')} bg={'myGray.50'} maxLength={200} />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button isLoading={loading} onClick={handleSubmit(onSave)} px={6}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>

      <AvatarUploader />
    </MyModal>
  );
};

export default EditResourceModal;
