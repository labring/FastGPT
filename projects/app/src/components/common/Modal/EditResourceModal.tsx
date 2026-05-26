import React, { useCallback } from 'react';
import { Input, Button, Box, Textarea, Flex } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
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

  const { runAsync: onSave, loading } = useRequest(
    (data: EditResourceInfoFormType) => onEdit(data),
    {
      onSuccess: () => {
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
    <MyModal
      isOpen
      onClose={onClose}
      title={title}
      size={'sm'}
      isCentered
      closeOnOverlayClick={false}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={loading} onClick={handleSubmit(onSave)}>
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Flex flexDirection={'column'} gap={6}>
        {/* 图标 & 名称 */}
        <Box>
          <FormLabel mb={2}>{t('common:core.app.Name and avatar')}</FormLabel>
          <Flex alignItems={'center'}>
            <MyTooltip label={t('common:set_avatar')}>
              <Flex
                borderRadius={'6px'}
                w={'34px'}
                h={'34px'}
                border={'1px solid'}
                borderColor={'myGray.200'}
                justifyContent={'center'}
                alignItems={'center'}
                mr={3}
                p={'4px'}
                cursor={'pointer'}
                onClick={handleAvatarSelectorOpen}
              >
                <Avatar src={avatar} w={'24px'} borderRadius={'6px'} />
              </Flex>
            </MyTooltip>
            <Input
              flex={1}
              size={'sm'}
              {...register('name', { required: true })}
              autoFocus
              maxLength={100}
            />
          </Flex>
        </Box>

        {/* 介绍 */}
        <Box>
          <FormLabel mb={2}>{t('common:Intro')}</FormLabel>
          <Textarea
            {...register('intro')}
            h={'90px'}
            minH={'90px'}
            maxLength={200}
            resize={'vertical'}
          />
        </Box>
      </Flex>

      <AvatarUploader />
    </MyModal>
  );
};

export default EditResourceModal;
